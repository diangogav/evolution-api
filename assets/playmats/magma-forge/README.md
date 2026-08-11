# Magma Forge playmat

Meshy-generated source prepared for the `playmats/magma-forge/` R2 catalog
prefix. The original 7,010,844-byte GLB used four embedded 2048×2048 JPEG
textures. This checked-in delivery asset resizes them to 1024×1024, keeping the
mesh and material channels intact.

- R2 key: `playmats/magma-forge/magma-forge.glb`
- MIME type: `model/gltf-binary`
- Size: 317,844 bytes
- SHA-256: `7c65e19d784b4bc64c62e22f61d67c5d4561f46ce6f5c1e5957172177e6b7b4a`
- Validation: glTF-Transform 4.4.2, no errors or warnings

Magma Forge is intentionally absent from the standard seed. Publish this file
from Evolution Backoffice with type `PLAYMAT`, tier `EXCLUSIVE`, and slug
`magma-forge`; the administrative API uploads the object and registers its
catalog row atomically. Do not upload it manually before using the backoffice,
because publication refuses to overwrite an existing R2 key.

See the complete [cosmetics operations guide](../../../docs/cosmetics-operations.es.md)
for catalog registration, indexing, and per-user assignment.
