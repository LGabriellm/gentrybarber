export function unmask(value: string): string {
  return value.replace(/\D/g, '');
}

export function maskPhone(value: string): string {
  let digits = unmask(value);
  if (value.startsWith('+55') && digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

export function parsePhone(value: string): string {
  const digits = unmask(value);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    return '+' + digits;
  }
  return '+55' + digits;
}

export function maskCPF(value: string): string {
  const digits = unmask(value);
  if (digits.length === 0) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function maskCEP(value: string): string {
  const digits = unmask(value);
  if (digits.length === 0) return '';
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}
