# Instrucciones para Jules (Google AI Coding Agent)

Este proyecto es **Filoteca · Taller 3D**, una aplicación de escritorio para Windows empaquetada con Electron, React 19, Vite, Tailwind CSS v4 y SQLite local (`sql.js`).

---

## 1. Comandos Principales de Verificación

Antes de fusionar código o preparar un release, verifica:

```bash
# 1. Validar tipos de TypeScript
npm run typecheck

# 2. Ejecutar suite de pruebas de G-code y algoritmos CIELAB
npm run test:gcode

# 3. Compilar frontend (Vite) y proceso principal (Electron)
npm run build
```

---

## 2. Gestión de Releases

La generación de binarios Windows (`.exe` portable e instalador) está automatizada en **GitHub Actions** a través del flujo [`.github/workflows/release.yml`](../.github/workflows/release.yml).

### Procedimiento para que Jules cree un nuevo Release:
1. **Actualizar versión:** Modificar el campo `"version"` en `package.json` (por ejemplo a `1.0.1`).
2. **Crear Pull Request o Commit:** Describir en el mensaje del commit o PR los cambios realizados (Changelog).
3. **Crear Tag de Git:** Crear el tag correspondiente con prefijo `v` (por ejemplo `v1.0.1`) y enviarlo al repositorio (`git tag v1.0.1 && git push origin v1.0.1`).
4. **Publicación Automática:** El flujo de GitHub Actions se activará automáticamente al detectar el tag `v*`, compilará en un entorno Windows y publicará la nueva versión en la sección **Releases** de GitHub con:
   - `Filoteca-Portable-X.X.X.exe`
   - `Filoteca-Setup-X.X.X.exe` (Instalador NSIS)
   - Notas de lanzamiento generadas automáticamente a partir de los commits.

---

## 3. Restricciones Críticas del Proyecto
- **100% Offline:** La base de datos es SQLite local en WebAssembly (`sql.js`). No agregar dependencias de servidores remotos o bases de datos en la nube.
- **Rendimiento 3D:** El renderizado de bobinas Three.js corre bajo demanda a **30 FPS**. No introducir bucles `requestAnimationFrame` permanentes ni re-renderizados continuos de React en eventos de ratón.
- **Moneda:** Formato en pesos colombianos (COP), formateado como `$ 89.900`.
