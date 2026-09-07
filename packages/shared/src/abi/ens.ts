/** Minimal ENSv2 ABIs used off-chain (adapter write-backs + frontend reads). */
export const permissionedResolverAbi = [
  {
    type: 'function',
    name: 'setText',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'text',
    stateMutability: 'view',
    inputs: [
      { name: 'node', type: 'bytes32' },
      { name: 'key', type: 'string' },
    ],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'authorizeTextRoles',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'bytes' },
      { name: 'key', type: 'string' },
      { name: 'account', type: 'address' },
      { name: 'authorized', type: 'bool' },
    ],
    outputs: [],
  },
  { type: 'error', name: 'EACUnauthorizedAccountRoles', inputs: [
      { name: 'resource', type: 'uint256' }, { name: 'roles', type: 'uint256' }, { name: 'account', type: 'address' } ] },
] as const

export const universalResolverAbi = [
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'view',
    inputs: [
      { name: 'name', type: 'bytes' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [
      { name: '', type: 'bytes' },
      { name: 'address', type: 'address' },
    ],
  },
] as const
