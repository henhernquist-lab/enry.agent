// Encryption helpers for stored user credentials (IC passwords, OAuth refresh
// tokens). Uses AES-256-GCM with a key derived from CREDENTIALS_ENCRYPTION_KEY
// env var. Never logs plaintext. Never exposes decrypted values to the client.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT = 'golem-hq-credential-vault-2026' // fixed salt for key derivation

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is not set — cannot encrypt/decrypt user credentials')
  }
  // Derive a 32-byte key from the env var using scrypt
  return scryptSync(raw, SALT, 32)
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv) + ':' + base64(encrypted) + ':' + base64(tag)
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`
}

export function decrypt(encoded: string): string {
  const key = getKey()
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted credential format')
  const iv = Buffer.from(parts[0], 'base64')
  const encrypted = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}
