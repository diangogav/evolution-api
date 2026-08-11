# Operación de cosméticos: publicar y asignar recursos

Esta guía describe el flujo seguro para agregar un recurso al catálogo de
Evolution y, cuando sea exclusivo, concedérselo a un usuario concreto.

## Camino recomendado: Evolution Backoffice

El proyecto `../evolution-backoffice` reúne el flujo habitual en una interfaz:

1. Inicia `evolution-api` con `bun run dev`.
2. En otra terminal, entra a `evolution-backoffice` y ejecuta `npm run dev`.
3. Abre `http://localhost:5174` e inicia sesión con una cuenta de rol `admin`.
4. Elige tipo, tier, nombre y slug. Para acceso individual usa `EXCLUSIVE`.
5. Arrastra el GLB o el conjunto completo de archivos y revisa el preview.
6. Opcionalmente indica el username que recibirá la primera concesión.
7. Pulsa **Publicar recurso**. La API sube a R2, crea la fila del catálogo y
   revierte los objetos nuevos si la escritura en base de datos falla.
8. Usa la vista **Catálogo** para conceder el recurso a más usuarios.

Antes del primer uso ejecuta una vez la migración que impide prefijos
duplicados:

```bash
bun run migration:cosmetics:run
```

La cuenta usada por el API necesita una credencial R2 **Object Read & Write**.
El navegador nunca recibe credenciales de R2 ni de PostgreSQL. El resto de esta
guía documenta el procedimiento manual y sirve como referencia o recuperación.

Magma Forge no forma parte del seed estándar. Debe publicarse desde el
backoffice con tier `EXCLUSIVE`, usando el slug `magma-forge` y el archivo
`assets/playmats/magma-forge/magma-forge.glb`.

```text
preparar archivos → subir a R2 → registrar catálogo → indexar manifiesto
                                                     ↓
                                      conceder entitlement al usuario
                                                     ↓
                                            el usuario lo equipa
```

Ejecuta todos los comandos desde la raíz de `evolution-api`.

## 0. Verificar el entorno de destino

Antes de cualquier escritura confirma que `.env` apunta al bucket y a la base
de datos correctos. Deben estar configuradas, como mínimo, estas variables:

- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`.
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`,
  `POSTGRES_DB`.

El cargador verifica existencia y tamaño además de escribir, por lo que necesita
una credencial **Object Read & Write** limitada al bucket. No hace falta permiso
administrativo.

Nunca pongas secretos directamente en un comando ni los agregues al repositorio.

## 1. Elegir nombre, prefijo y visibilidad

Usa un slug estable en minúsculas y `kebab-case`. El `assetRef` siempre es el
prefijo de una carpeta y siempre termina en `/`:

```text
playmats/magma-forge/
sleeves/my-sleeve/
avatars/my-avatar/
companions/my-companion/
```

Elige el tier antes de publicar:

| Tier         | Quién puede verlo y usarlo                                 |
| ------------ | ---------------------------------------------------------- |
| `STANDARD`   | Cualquier persona, incluso anónima                         |
| `REGISTERED` | Cualquier usuario autenticado                              |
| `DONOR`      | Usuarios con entitlement de tier `DONOR`                   |
| `EXCLUSIVE`  | Solo usuarios con un entitlement para ese cosmético exacto |

Para asociar el recurso a una sola persona o a una lista controlada, usa
`EXCLUSIVE`. Conceder individualmente un cosmético `STANDARD` o `REGISTERED` es
redundante porque su tier ya da acceso.

## 2. Preparar los archivos

La aplicación consume actualmente estos formatos:

| Tipo        | Archivos esperados                                                       |
| ----------- | ------------------------------------------------------------------------ |
| `SLEEVE`    | `render.jpg`; `preview.jpg` es opcional y cae a `render.jpg`             |
| `AVATAR`    | `render.jpg`; `preview.jpg` es opcional y cae a `render.jpg`             |
| `PLAYMAT`   | Un `.glb` autocontenido, o `.gltf` junto con todos sus `.bin` y texturas |
| `COMPANION` | GLB del personaje, `preview.jpg` y, si aplica, GLB del rig externo       |

Mantén los archivos planos dentro del prefijo siempre que sea posible. En un
`.gltf`, conserva exactamente los nombres relativos que aparecen en el JSON.

Para un playmat generado por Meshy se recomienda:

1. Conservar el original fuera del artefacto de entrega.
2. Reducir texturas de 2048×2048 a 1024×1024 si no se pierde detalle visible.
3. Validar el resultado antes de subirlo.

Ejemplo con glTF-Transform:

```bash
npx --yes @gltf-transform/cli resize source.glb optimized.glb --width 1024 --height 1024
npx --yes @gltf-transform/cli validate optimized.glb
```

Guarda una copia versionada del artefacto que realmente se subirá:

```text
assets/playmats/<slug>/<archivo>.glb
```

## 3. Subir los archivos a R2

Usa el cargador del proyecto. Detecta el MIME por extensión, verifica el tamaño
remoto y se niega a sobrescribir una clave existente:

```bash
bun run upload:cosmetic-asset <archivo-local> <clave-r2>
```

Ejemplo:

```bash
bun run upload:cosmetic-asset assets/playmats/magma-forge/magma-forge.glb playmats/magma-forge/magma-forge.glb
```

Para un `.gltf` con dependencias, ejecuta el comando una vez por archivo y usa
el mismo prefijo para todos:

```bash
bun run upload:cosmetic-asset assets/playmats/arena/arena.gltf playmats/arena/arena.gltf
bun run upload:cosmetic-asset assets/playmats/arena/arena.bin playmats/arena/arena.bin
bun run upload:cosmetic-asset assets/playmats/arena/albedo.png playmats/arena/albedo.png
```

Si aparece `AccessDenied`, detente: la credencial no tiene `Object Write`. No
crees todavía la fila del catálogo, porque quedaría apuntando a un prefijo vacío.

## 4. Registrar el cosmético en el seed

Agrega una entrada a
`src/modules/catalog/application/standardCosmetics.ts`. Aunque el arreglo se
llama `STANDARD_COSMETICS`, contiene los tiers disponibles, incluidos los
exclusivos.

Ejemplo de playmat exclusivo:

```ts
{
	type: CosmeticType.PLAYMAT,
	tier: CosmeticTier.EXCLUSIVE,
	assetRef: "playmats/my-playmat/",
	displayName: "My Playmat",
},
```

Los companions también necesitan un `CompanionAnimationDescriptor` con el
nombre real del archivo de rig y de cada clip. Confirma esos nombres en el GLB
antes del primer seed.

El seed es **insert-only** y busca por `assetRef`: volver a ejecutarlo no cambia
nombre, tier ni animaciones de una entrada existente. Esos cambios requieren
una migración de datos revisada.

## 5. Validar el cambio de código

```bash
bun test tests/unit/modules/catalog/application/SeedStandardCosmetics.test.ts
bun run lint
bun run build
```

Si agregaste un formato que el frontend aún no reconoce, actualiza primero el
mapper correspondiente en `evolution-card-game` y despliega ambos proyectos.

## 6. Crear la fila e indexar sus archivos

Con el asset ya presente en R2 y el código apuntando al entorno correcto:

```bash
bun run seed:cosmetics
bun run index:cosmetic-assets
```

El primer comando crea las entradas faltantes. El segundo lista cada prefijo R2
nuevo y persiste `asset_files`; las peticiones normales pueden entonces firmar
el manifiesto sin listar R2 cada vez.

`index:cosmetic-assets` omite entradas cuyo `asset_files` ya no sea `NULL`. Para
reemplazar archivos de un cosmético existente, prefiere un prefijo versionado
nuevo. Si debes conservar el prefijo, usa una migración revisada que reinicie su
índice; no edites la base de datos a ciegas.

Las migraciones de esquema no son necesarias para un cosmético normal. Ejecuta
`bun run migration:cosmetics:run` solo cuando el cambio incluya una migración.

## 7. Obtener el ID del usuario

La asignación usa `users.id`, no el nombre visible. Obtén el ID mediante la
herramienta administrativa o una consulta de solo lectura en la misma base:

```sql
SELECT id, username
FROM users
WHERE lower(username) = lower('NombreDelUsuario');
```

Confirma tanto `id` como `username` antes de continuar.

## 8. Conceder el cosmético al usuario

```bash
bun run assign:cosmetic <userId> <assetRef> <source>
```

Ejemplo:

```bash
bun run assign:cosmetic 1a2b3c playmats/my-playmat/ CAMPAIGN
```

Valores válidos para `source`:

- `REGISTRATION`: premio ligado al registro.
- `DONATION`: beneficio por donación.
- `PURCHASE`: compra individual.
- `CAMPAIGN`: torneo, promoción o concesión administrativa.

El comando es idempotente: repetir la misma asignación no crea duplicados. El
entitlement creado no expira.

## 9. Verificar con la cuenta destinataria

Con un JWT de esa cuenta, consulta el catálogo personalizado:

```bash
curl -H "Authorization: Bearer <JWT>" "<API_BASE>/api/v1/me/cosmetics?type=PLAYMAT"
```

Comprueba que:

1. Aparece el `displayName` esperado.
2. `assets` contiene todos los archivos del prefijo.
3. Las URLs firmadas descargan correctamente.
4. El recurso aparece y se previsualiza en el inventario del cliente.

Asignar no equivale a equipar. El usuario puede seleccionarlo desde el
inventario; el cliente llamará `PUT /api/v1/me/loadout` después de validar que
la cuenta tiene acceso.

## Checklist corta

- [ ] Prefijo nuevo, estable y terminado en `/`.
- [ ] Tier correcto; `EXCLUSIVE` para acceso individual.
- [ ] Asset optimizado y validado.
- [ ] Todos los archivos subidos a R2 con MIME correcto.
- [ ] Entrada agregada al seed y pruebas aprobadas.
- [ ] `seed:cosmetics` ejecutado en la base correcta.
- [ ] `index:cosmetic-assets` encontró los archivos.
- [ ] `userId` verificado.
- [ ] `assign:cosmetic` ejecutado con la fuente correcta.
- [ ] Catálogo personalizado y render final comprobados.

## Errores frecuentes

- **`AccessDenied` al subir:** falta `Object Read & Write` en la credencial R2.
- **El cosmético no aparece:** tier incorrecto, entitlement ausente o API sin
  desplegar.
- **El manifiesto está vacío:** se indexó antes de subir los archivos o se usó
  un prefijo diferente.
- **El modelo cae al playmat por defecto:** falta una dependencia, el `.gltf`
  referencia otro nombre, o el frontend no reconoce el formato.
- **El seed no actualiza una entrada:** es intencional; el seed solo inserta.
- **La asignación funciona pero no se ve en duelo:** acceso y equipamiento son
  pasos separados.
