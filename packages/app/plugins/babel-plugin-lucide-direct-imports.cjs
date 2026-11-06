const fs = require("node:fs");
const path = require("node:path");

const PACKAGE_NAME = "lucide-react-native";
const CONTEXT_MODULE = `${PACKAGE_NAME}/internal-context`;

function readIconExports() {
  const entry = require.resolve(PACKAGE_NAME, { paths: [__dirname] });
  const esmEntry = path.resolve(path.dirname(entry), "../esm/lucide-react-native.mjs");
  const source = fs.readFileSync(esmEntry, "utf8");
  const exports = new Map();
  const exportPattern = /export \{([^}]+)\} from '\.\/icons\/([^']+)';/g;
  let match;

  while ((match = exportPattern.exec(source))) {
    const file = match[2].replace(/\.mjs$/, "");
    for (const item of match[1].split(",")) {
      const alias = item.trim().match(/^default as (.+)$/);
      if (alias) {
        exports.set(alias[1], file);
      }
    }
  }

  return exports;
}

module.exports = function lucideDirectImports({ types: t }) {
  const iconExports = readIconExports();

  return {
    name: "lucide-direct-imports",
    visitor: {
      ImportDeclaration(importPath) {
        if (importPath.node.source.value !== PACKAGE_NAME) {
          return;
        }
        if (importPath.node.importKind === "type" || importPath.node.importKind === "typeof") {
          return;
        }

        const valueSpecifiers = [];
        const typeSpecifiers = [];
        for (const specifier of importPath.node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            continue;
          }
          if (specifier.importKind === "type" || specifier.importKind === "typeof") {
            typeSpecifiers.push(specifier);
          } else {
            valueSpecifiers.push(specifier);
          }
        }

        const directImports = valueSpecifiers.map((specifier) => {
          const importedName = specifier.imported.name;
          if (importedName === "LucideProvider") {
            return t.importDeclaration(
              [t.importSpecifier(specifier.local, t.identifier("LucideProvider"))],
              t.stringLiteral(CONTEXT_MODULE),
            );
          }

          const iconFile = iconExports.get(importedName);
          if (!iconFile) {
            throw importPath.buildCodeFrameError(
              `No direct import is available for ${importedName} from ${PACKAGE_NAME}.`,
            );
          }
          return t.importDeclaration(
            [t.importDefaultSpecifier(specifier.local)],
            t.stringLiteral(`${PACKAGE_NAME}/icons/${iconFile}`),
          );
        });

        if (directImports.length > 0) {
          importPath.insertBefore(directImports);
        }

        if (typeSpecifiers.length > 0) {
          const typeImport = t.importDeclaration(typeSpecifiers, t.stringLiteral(PACKAGE_NAME));
          typeImport.importKind = "type";
          importPath.replaceWith(typeImport);
        } else {
          importPath.remove();
        }
      },
    },
  };
};
