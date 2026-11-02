import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

// Module boundary ratchet. A module reaches another one only through its index.ts, and
// an index.ts exposes domain and application code, never infrastructure. The lists below
// record today's exceptions: they may only shrink. Removing a leak or a cycle means
// deleting its entry here; adding one fails the test.

const MODULES_DIR = join(import.meta.dir, "../../../src/modules");

// Cross-module imports that bypass the target's index.ts, as "importer -> target".
const KNOWN_LEAKS = ["stats/infrastructure/StatsSchemas.ts -> tiers/infrastructure/TierSchemas"];

// Groups of modules that depend on each other in a loop, each sorted by name.
const KNOWN_CYCLES = [["assets", "catalog", "entitlements", "loadout"]];

const IMPORT_PATTERN = /\bfrom\s+"([^"]+)"/g;

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith(".ts") ? [path] : [];
	});
}

type CrossModuleImport = { importer: string; from: string; to: string; target: string };

function crossModuleImports(): CrossModuleImport[] {
	return sourceFiles(MODULES_DIR).flatMap((file) => {
		const importer = relative(MODULES_DIR, file);
		const from = importer.split("/")[0];
		return [...readFileSync(file, "utf8").matchAll(IMPORT_PATTERN)].flatMap(([, specifier]) => {
			if (!specifier.startsWith(".")) return [];
			const target = relative(MODULES_DIR, normalize(join(dirname(file), specifier)));
			const to = target.split("/")[0];
			if (target.startsWith("..") || to === from) return [];
			return [{ importer, from, to, target }];
		});
	});
}

// Strongly connected components with more than one module (Tarjan).
function moduleCycles(edges: Map<string, Set<string>>): string[][] {
	let index = 0;
	const indexes = new Map<string, number>();
	const lowLinks = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const cycles: string[][] = [];

	const visit = (node: string) => {
		indexes.set(node, index);
		lowLinks.set(node, index);
		index++;
		stack.push(node);
		onStack.add(node);
		for (const next of edges.get(node) ?? []) {
			if (!indexes.has(next)) {
				visit(next);
				lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, lowLinks.get(next) ?? 0));
			} else if (onStack.has(next)) {
				lowLinks.set(node, Math.min(lowLinks.get(node) ?? 0, indexes.get(next) ?? 0));
			}
		}
		if (lowLinks.get(node) !== indexes.get(node)) return;
		const component: string[] = [];
		let member: string | undefined;
		do {
			member = stack.pop() as string;
			onStack.delete(member);
			component.push(member);
		} while (member !== node);
		if (component.length > 1) cycles.push(component.sort());
	};

	for (const node of edges.keys()) if (!indexes.has(node)) visit(node);
	return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

describe("module boundaries", () => {
	const imports = crossModuleImports();

	it("reaches other modules only through their index.ts, except the known leaks", () => {
		const leaks = imports
			.filter(({ target, to }) => target !== to)
			.map(({ importer, target }) => `${importer} -> ${target.replace(/\.ts$/, "")}`);

		expect([...new Set(leaks)].sort()).toEqual([...KNOWN_LEAKS].sort());
	});

	it("adds no dependency cycle between modules beyond the known ones", () => {
		const edges = new Map<string, Set<string>>();
		for (const { from, to } of imports) {
			if (!edges.has(from)) edges.set(from, new Set());
			edges.get(from)?.add(to);
		}

		expect(moduleCycles(edges)).toEqual(KNOWN_CYCLES);
	});

	it("keeps every index.ts to explicit domain and application exports", () => {
		const offending = readdirSync(MODULES_DIR).flatMap((module) => {
			const indexFile = join(MODULES_DIR, module, "index.ts");
			let source: string;
			try {
				source = readFileSync(indexFile, "utf8");
			} catch {
				return [];
			}
			const reexportsAll = /export\s+\*/.test(source);
			const specifiers = [...source.matchAll(IMPORT_PATTERN)].map(([, specifier]) => specifier);
			const outsideLayers = specifiers.filter(
				(specifier) => !/^\.\/(domain|application)\//.test(specifier),
			);
			return reexportsAll || outsideLayers.length > 0 ? [module] : [];
		});

		expect(offending).toEqual([]);
	});
});
