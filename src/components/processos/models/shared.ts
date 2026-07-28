export const CATEGORIAS = [
  { value: "societario", label: "Societário" },
  { value: "fiscal", label: "Fiscal" },
  { value: "dp", label: "Departamento Pessoal" },
  { value: "contabil", label: "Contábil" },
  { value: "certificado", label: "Certificado Digital" },
  { value: "regularizacao", label: "Regularização" },
  { value: "outro", label: "Outro" },
];

export const CAT_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.value, c.label]),
);
