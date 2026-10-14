// The store's sections ("departamentos"). Each one is defined here, in code,
// with its own product types and rules; the site shows a tab per section
// that has products. Adding a section = adding an entry here (plus any
// rules it needs, like sizes and colors for clothing).
//
//   kinds:    product types in this section: { kind: [singular, plural] }
//   scent:    products have a fragrance (grouped by it; paquetes pair by it)
//   packages: automatic paquetes (lotion + mists of the same scent)

export const DEPARTMENTS = [
  {
    id: 'lociones',
    name: 'Lociones',
    kinds: { lotion: ['Loción', 'Lociones'], mist: ['Mist', 'Mists'], other: ['Otro', 'Otros'] },
    scent: true,
    packages: true,
  },
];

export const KINDS = DEPARTMENTS.flatMap((d) => Object.keys(d.kinds));

/** Which section a product type belongs to ("package" -> the section that builds paquetes).
 *  A type no section claims returns '' and the product isn't shown anywhere. */
export function departmentOf(kind) {
  if (kind === 'package') return DEPARTMENTS.find((d) => d.packages)?.id ?? '';
  return DEPARTMENTS.find((d) => kind in d.kinds)?.id ?? '';
}
