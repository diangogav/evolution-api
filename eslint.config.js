import eslintConfigCodely from "eslint-config-codely";

export default [
	...eslintConfigCodely.full,
	{
		ignores: ["src/evolution-types/", "build"],
	},
];
