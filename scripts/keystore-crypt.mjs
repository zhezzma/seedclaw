#!/usr/bin/env node
/**
 * release.keystore 加密 / 解密工具
 *
 * 用法:
 *   npm run keystore:encrypt   # release.keystore    -> release.keystore.enc (可提交到 git)
 *   npm run keystore:decrypt   # release.keystore.enc -> release.keystore    (直接覆盖本地文件)
 *
 * 也可手动指定路径:
 *   node scripts/keystore-crypt.mjs encrypt [源文件] [目标文件]
 *   node scripts/keystore-crypt.mjs decrypt [源文件] [目标文件]
 *
 * 加密密钥从项目根目录 .env 的 KEYSTORE_ENC_KEY 读取(也可通过环境变量直接传入)。
 *
 * 加密方案: AES-256-GCM,密钥由 KEYSTORE_ENC_KEY 经 scrypt 派生(随机盐)。
 * 文件结构: MAGIC(8B) | salt(16B) | iv(12B) | authTag(16B) | ciphertext
 * GCM 自带完整性校验,密钥错误或文件损坏时解密会直接报错。
 */

import { config as loadDotenv } from 'dotenv'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// .env 始终按脚本所在的项目根目录查找,不受当前工作目录影响
const ENV_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')

const MAGIC = Buffer.from('SCKS1\0\0\0')
const SALT_LEN = 16
const IV_LEN = 12
const TAG_LEN = 16
const DEFAULT_PLAIN = 'release.keystore'
const DEFAULT_ENC = 'release.keystore.enc'

function fail(msg) {
  console.error(`[x] ${msg}`)
  process.exit(1)
}

function getKey() {
  loadDotenv({ path: ENV_PATH, quiet: true })
  const key = process.env.KEYSTORE_ENC_KEY?.trim()
  if (!key) {
    console.error('[x] 未找到加密密钥,请在项目根目录 .env 中配置:')
    console.error('    KEYSTORE_ENC_KEY=<你的加密密钥>')
    console.error('[i] 密钥请向仓库管理员获取,并妥善备份(丢失将无法解密)。')
    process.exit(1)
  }
  if (key.length < 8) {
    fail('KEYSTORE_ENC_KEY 太短,至少需要 8 个字符。')
  }
  return key
}

/** 密钥指纹,用于核对两台机器用的密码是否一致 */
function fingerprint(keyStr) {
  return createHash('sha256').update(keyStr).digest('hex').slice(0, 12)
}

async function encryptFile(src, dst, password) {
  const plain = await readFile(src)
  if (plain.subarray(0, MAGIC.length).equals(MAGIC)) {
    fail(`源文件 ${src} 已经是加密文件,请勿重复加密。`)
  }
  const salt = randomBytes(SALT_LEN)
  const iv = randomBytes(IV_LEN)
  const key = scryptSync(password, salt, 32)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  const out = Buffer.concat([MAGIC, salt, iv, tag, ciphertext])
  await writeFile(dst, out)
}

async function decryptFile(src, dst, password) {
  const data = await readFile(src)
  const headerLen = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN
  if (data.length < headerLen || !data.subarray(0, MAGIC.length).equals(MAGIC)) {
    fail(`${src} 不是本工具生成的加密文件(或已损坏)。`)
  }
  let offset = MAGIC.length
  const salt = data.subarray(offset, (offset += SALT_LEN))
  const iv = data.subarray(offset, (offset += IV_LEN))
  const tag = data.subarray(offset, (offset += TAG_LEN))
  const ciphertext = data.subarray(offset)

  const key = scryptSync(password, salt, 32)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  let plain
  try {
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    fail('解密失败:密钥错误(KEYSTORE_ENC_KEY 不匹配)或文件已损坏。')
  }
  await writeFile(dst, plain)
}

function usage() {
  console.log(`用法:
  npm run keystore:encrypt   # release.keystore -> release.keystore.enc
  npm run keystore:decrypt   # release.keystore.enc -> release.keystore (覆盖)

  node scripts/keystore-crypt.mjs <encrypt|decrypt> [源文件] [目标文件]`)
}

async function main() {
  const [cmd, ...paths] = process.argv.slice(2)
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage()
    process.exit(cmd ? 0 : 1)
  }

  const key = getKey()
  console.log(`[i] 密钥指纹: ${fingerprint(key)}`)

  try {
    if (cmd === 'encrypt') {
      const src = paths[0] ?? DEFAULT_PLAIN
      const dst = paths[1] ?? DEFAULT_ENC
      await encryptFile(src, dst, key)
      const inSize = (await readFile(src)).length
      const outSize = (await readFile(dst)).length
      console.log(`[✓] 加密完成: ${src} (${inSize} B) -> ${dst} (${outSize} B)`)
      console.log(`[i] ${dst} 可安全提交到 git,密钥(${'.env'})切勿提交。`)
    } else if (cmd === 'decrypt') {
      const src = paths[0] ?? DEFAULT_ENC
      const dst = paths[1] ?? DEFAULT_PLAIN
      await decryptFile(src, dst, key)
      console.log(`[✓] 解密完成: ${src} -> ${dst} (已覆盖本地文件)`)
    } else {
      usage()
      fail(`未知命令: ${cmd}`)
    }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      fail(`文件不存在: ${err.path}`)
    }
    fail(err?.message ?? String(err))
  }
}

main()
