// Password/confirmation pairs shared by POST /api/auth/register and POST /api/auth/google/register.
// Each row: label, password, confirmPassword, expected status code.
export const passwordConfirmationCases: [string, string, unknown, number][] = [
  ['missing', 'long password', undefined, 400],
  ['null', 'long password', null, 400],
  ['number', 'long password', 123, 400],
  ['array', 'long password', ['long password'], 400],
  ['object', 'long password', { value: 'long password' }, 400],
  ['shorter', 'long password', 'long passwor', 400],
  ['longer', 'long password', 'long password!', 400],
  ['oversized', 'long password', 'x'.repeat(129), 400],
  ['same-length mismatch', 'long password', 'long passworD', 400],
  ['trailing null', 'long password', 'long password\u0000', 400],
  ['different UTF-8 byte lengths', 'passworda', 'passwordé', 400],
  ['normalization-equivalent', 'passwordＡ', 'passwordA', 400],
  ['distinct unpaired surrogates', 'password\ud800', 'password\ud801', 400],
  ['replacement character', 'password\ud800', 'password�', 400],
  ['matching Unicode', '密码🔐秘密口令', '密码🔐秘密口令', 201],
  ['maximum length', 'x'.repeat(128), 'x'.repeat(128), 201],
];
