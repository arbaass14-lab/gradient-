import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
export default defineConfig({
  plugins: [
    {
      name: "local-pdf-assets",
      closeBundle() {
        for (const folder of ["cmaps", "standard_fonts"])
          fs.cpSync(
            path.join(pdfRoot, folder),
            path.join("dist/pdf-assets", folder),
            { recursive: true },
          );
      },
      configureServer(server) {
        server.middlewares.use("/pdf-assets", (req, res, next) => {
          const safePath = path.resolve(
            pdfRoot,
            "." + (req.url || "").split("?")[0],
          );
          if (
            !["cmaps", "standard_fonts"].some((folder) =>
              safePath.startsWith(path.join(pdfRoot, folder) + path.sep),
            )
          )
            return next();
          if (!fs.existsSync(safePath) || !fs.statSync(safePath).isFile())
            return next();
          res.setHeader("Content-Type", "application/octet-stream");
          fs.createReadStream(safePath).pipe(res);
        });
      },
    },
  ],
  build: { target: "es2022", sourcemap: false },
  esbuild: { jsx: "automatic" },
});
