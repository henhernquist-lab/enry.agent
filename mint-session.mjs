import { encode } from '/workspaces/enry.agent/node_modules/.pnpm/@auth+core@0.41.2/node_modules/@auth/core/jwt.js'

const secret = process.env.NEXTAUTH_SECRET
const token = await encode({
  token: { googleId: '108422475472513497457', email: 'hhernqui9241@apsk12.org', name: 'Henry', sub: '108422475472513497457' },
  secret,
  salt: 'authjs.session-token',
})
console.log(token)
