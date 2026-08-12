export function maskCNPJ(value: string): string {
  const d = (value ?? "").replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function isValidCnpjLength(v: string | null | undefined): boolean {
  return onlyDigits(v).length === 14;
}

export function validateCnpj(cnpj: string): boolean {
  cnpj = onlyDigits(cnpj);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const t = cnpj.length - 2;
  const d = cnpj.substring(t);
  const v1 = calculateDigit(cnpj.substring(0, t), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const v2 = calculateDigit(cnpj.substring(0, t) + v1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return v1 === parseInt(d.charAt(0)) && v2 === parseInt(d.charAt(1));
}

function calculateDigit(s: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += parseInt(s.charAt(i)) * weights[i];
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
