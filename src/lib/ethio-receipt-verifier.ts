/**
 * Ethiopian Bank & Mobile Money Digital Receipt Verifier
 * Inspired by ethiobank-receipts
 * Supports Telebirr, Commercial Bank of Ethiopia (CBE), and general receipt URL links.
 */

import { getPaymentSettings } from '@/lib/payment-settings'

export const DEFAULT_CBE_ACCOUNT = process.env.DEFAULT_CBE_ACCOUNT || ''

export interface VerifiedReceipt {
  success: boolean
  provider: 'TELEBIRR' | 'CBE' | 'DASHEN' | 'AWASH' | 'BOA' | 'UNKNOWN'
  reference: string
  payerName?: string
  payerAccountOrPhone?: string
  receiverName?: string
  receiverAccount?: string
  isReceiverMatched?: boolean
  amount?: number
  currency: string
  dateTime?: string
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'UNKNOWN'
  isTimeout?: boolean
  rawText?: string
  errorMessage?: string
}

export interface VerifyReceiptParams {
  provider?: 'TELEBIRR' | 'CBE' | 'AUTO'
  referenceOrUrl: string
  accountDigits?: string // Used for CBE (last 8 digits of receiver account)
  expectedAmount?: number
  htmlContent?: string // Option B: Direct device-level fetched slip HTML
}

/**
 * Safely verify if a received account or phone number matches the target account/phone,
 * handling masked digits (e.g. "1****7722", "1*********7722", "09****2484", "1000****7818")
 */
export function matchMaskedAccountOrPhone(
  target: string | undefined | null,
  received: string | undefined | null
): boolean {
  if (!target || !target.trim()) return true // No restriction configured
  if (!received || !received.trim()) return false // Target account/phone is required, but receipt has none!

  const cleanTarget = target.trim().replace(/\D/g, '')
  if (cleanTarget.length < 4) return true

  const rawReceived = received.trim()

  // 1. If received contains masking characters (*, X, x, #, .)
  if (/[*Xx#.]/.test(rawReceived)) {
    // Extract trailing unmasked digits (at least 3-4 digits at the end)
    const suffixMatch = rawReceived.match(/(\d{3,})$/)
    // Extract leading unmasked digits (before the mask)
    const prefixMatch = rawReceived.match(/^(\d+)/)

    const suffix = suffixMatch ? suffixMatch[1] : ''
    const prefix = prefixMatch ? prefixMatch[1] : ''

    // Suffix verification: Target must end with the suffix digits
    if (suffix && suffix.length >= 3) {
      if (!cleanTarget.endsWith(suffix)) {
        return false // Suffix does not match!
      }
    }

    // Prefix verification: Target (or normalized target) must start with prefix
    if (prefix && prefix.length >= 1) {
      const targetWithoutCountryCode = cleanTarget.replace(/^251/, '0')
      const targetInternational = cleanTarget.startsWith('0') ? '251' + cleanTarget.slice(1) : cleanTarget
      const matchesPrefix =
        cleanTarget.startsWith(prefix) ||
        targetWithoutCountryCode.startsWith(prefix) ||
        targetInternational.startsWith(prefix)

      if (!matchesPrefix) {
        return false // Prefix does not match!
      }
    }

    return true
  }

  // 2. If received is not masked (full or partial digits)
  const cleanReceived = rawReceived.replace(/\D/g, '')
  if (!cleanReceived) return true

  if (cleanReceived.length >= 4) {
    if (cleanTarget.endsWith(cleanReceived) || cleanReceived.endsWith(cleanTarget)) {
      return true
    }
    const checkLen = Math.min(cleanTarget.length, cleanReceived.length, 8)
    if (checkLen >= 4) {
      if (cleanTarget.slice(-checkLen) === cleanReceived.slice(-checkLen)) {
        return true
      }
    }
  }

  return cleanTarget.includes(cleanReceived) || cleanReceived.includes(cleanTarget)
}

/**
 * Clean and normalize transaction ID / reference string
 */
export function cleanReference(raw: string): string {
  return (raw || '').trim().replace(/\s+/g, '')
}

/**
 * Extract Telebirr transaction ID from plain text, URL, Telebirr SuperApp EMVCo QR code, or SMS message
 */
export function extractTelebirrTransactionId(raw: string): string {
  const clean = (raw || '').trim()
  if (!clean) return ''

  // 1. If it's a URL
  const urlMatch = clean.match(/\/receipt\/([A-Za-z0-9_-]+)/i)
  if (urlMatch) {
    return urlMatch[1].toUpperCase()
  }

  // 2. Structured SMS or text tag: "Transaction number: DJJ7261SX7", "Txn ID: DJJ7261SX7", "የግብይት ቁጥር: DJJ7261SX7"
  const smsTagMatch = clean.match(/(?:Transaction\s*(?:number|no|id)|Txn\s*ID|የግብይት\s*ቁጥር|Receipt\s*(?:no|number)|Ref(?:erence)?(?:\s*No)?)[:\s]+([A-Za-z0-9]{8,14})/i)
  if (smsTagMatch) {
    return smsTagMatch[1].toUpperCase()
  }

  // 3. If it's a Base64-encoded Telebirr SuperApp QR code
  try {
    const decoded = Buffer.from(clean.replace(/\s+/g, ''), 'base64').toString('utf8')
    const match = decoded.match(/000A([0-9a-fA-F]{20})/i)
    if (match) {
      const ascii = Buffer.from(match[1], 'hex').toString('utf8')
      if (/^[A-Za-z0-9]{8,14}$/.test(ascii)) {
        return ascii.toUpperCase()
      }
    }
  } catch {}

  // 4. If it's directly the decoded EMVCo string
  const directMatch = clean.match(/000A([0-9a-fA-F]{20})/i)
  if (directMatch) {
    try {
      const ascii = Buffer.from(directMatch[1], 'hex').toString('utf8')
      if (/^[A-Za-z0-9]{8,14}$/.test(ascii)) {
        return ascii.toUpperCase()
      }
    } catch {}
  }

  // 5. Look for standalone 10-character Telebirr reference code in sentence or SMS text (e.g. DJJ7261SX7)
  const tokens = clean.split(/[\s,.;:()!?-]+/)
  for (const token of tokens) {
    const cleanTok = token.replace(/[^A-Za-z0-9]/g, '')
    if (
      cleanTok.length === 10 &&
      /^[A-Z0-9]{10}$/i.test(cleanTok) &&
      !/^[A-Z]+$/i.test(cleanTok) &&
      !/^[0-9]+$/i.test(cleanTok) &&
      !/^(TELEBIRR|ETHIOTELE|COMMERCIAL)/i.test(cleanTok)
    ) {
      return cleanTok.toUpperCase()
    }
  }

  // 6. Default clean alphanumeric code
  return clean.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase()
}

/**
 * Fetch with automatic in-flight retry against Ethio Telecom gateway.
 * Absorbs intermittent packet drops and network latency spikes so users don't have to scan multiple times!
 */
async function fetchTelebirrWithRetry(url: string, maxAttempts = 2): Promise<Response> {
  let lastErr: any = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Attempt 1: 3.5s fast timeout. Attempt 2: 4.5s timeout. (Max 8s total to prevent cashier freeze)
    const timeoutMs = attempt === 1 ? 3500 : 4500
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      // If we got an OK response or permanent 404/400, return immediately
      if (res.ok || res.status === 404 || res.status === 400) {
        return res
      }

      // If 5xx or server rate-limit error, wait briefly before retrying
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 200))
      }
    } catch (err: any) {
      lastErr = err
      // On network timeout or connection reset, wait briefly and retry with a fresh socket
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 250))
      }
    }
  }
  throw lastErr || new Error('Ethio Telecom receipt gateway timed out (8s limit)')
}

/**
 * Parse Telebirr HTML slip directly (used for Option B device-level fetch & server fetch)
 */
export async function parseTelebirrReceiptHtml(
  html: string,
  transactionId: string,
  accountDigits?: string
): Promise<VerifiedReceipt> {
  if (html.includes('This request is not correct') || html.includes('not found') || html.length < 400) {
    return {
      success: false,
      provider: 'TELEBIRR',
      reference: transactionId,
      currency: 'ETB',
      status: 'FAILED',
      errorMessage: 'Invalid or expired Telebirr transaction receipt. Please check the code.',
    }
  }

  // Helper regex to extract label -> value pairs in HTML table (supporting multiline values)
  const extractField = (pattern: RegExp): string | undefined => {
    const match = html.match(pattern)
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : undefined
  }

  const payerName = extractField(/Payer\s*Name[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
  const payerPhone = extractField(/Payer\s*telebirr[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
  const receiverName = extractField(/Credited\s*Party\s*name[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
  const receiverPhone =
    extractField(/Credited\s*party\s*account\s*no[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i) ||
    extractField(/Credited\s*Party\s*telebirr[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i) ||
    extractField(/Receiver\s*telebirr[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i) ||
    extractField(/Credited\s*party\s*no[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
  const rawStatus = extractField(/transaction\s*status[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i) || 'Completed'

  // Extract amount: Prioritize Settled Amount (net amount received by merchant), then Total Paid Amount
  const settledMatch = html.match(/Settled\s*Amount[\s\S]*?([\d,.]+)\s*Birr/i) ||
                       html.match(/የተከፈለው\s*መጠን[\s\S]*?([\d,.]+)\s*Birr/i) ||
                       html.match(/<td[^>]*class="[^"]*receipttableTd2[^"]*"[^>]*>[^<]*<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*Birr/i)
  const totalPaidMatch = html.match(/Total\s*Paid\s*Amount[\s\S]*?([\d,.]+)\s*Birr/i) ||
                         html.match(/ጠቅላላ\s*የተከፈለ[\s\S]*?([\d,.]+)\s*Birr/i) ||
                         html.match(/Total\s*Paid\s*Amount[^<]*<\/t[dh]>\s*<td[^>]*>([\s\S]*?)<\/td>/i)
  const rawAmount = settledMatch ? settledMatch[1] : (totalPaidMatch ? totalPaidMatch[1] : undefined)

  // Extract payment date: From data row containing date timestamp e.g. "19-10-2026 15:03:21"
  const dateRowMatch = html.match(/<td[^>]*class="[^"]*receipttableTd[^"]*"[^>]*>\s*(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})\s*<\/td>/i) ||
                       html.match(/\b(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2})\b/) ||
                       html.match(/\b(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\b/)
  const rawDate = dateRowMatch ? dateRowMatch[1].trim() : undefined

  let parsedAmount: number | undefined
  if (rawAmount) {
    const numMatch = rawAmount.replace(/,/g, '').match(/[\d.]+/)
    if (numMatch) parsedAmount = parseFloat(numMatch[0])
  }

  const isSuccess = /completed|success|approved/i.test(rawStatus)

  // Check receiver phone/account against configured settings or provided account
  const settings = await getPaymentSettings()
  const targetPhone = (accountDigits && accountDigits.trim())
    ? accountDigits.trim()
    : (settings.telebirrReceiverPhone || '')

  let isReceiverMatched = true
  if (targetPhone && targetPhone.trim()) {
    isReceiverMatched = matchMaskedAccountOrPhone(targetPhone, receiverPhone)
    // Fallback: If receiver phone is masked or missing, check merchantName against receiverName
    if (!isReceiverMatched && settings.merchantName && receiverName) {
      const cleanRecv = receiverName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const cleanMerch = settings.merchantName.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (cleanRecv.includes(cleanMerch) || cleanMerch.includes(cleanRecv)) {
        isReceiverMatched = true
      }
    }
  }

  if (isSuccess && !isReceiverMatched) {
    return {
      success: false,
      provider: 'TELEBIRR',
      reference: transactionId,
      payerName: payerName || undefined,
      payerAccountOrPhone: payerPhone || undefined,
      receiverName: receiverName || undefined,
      receiverAccount: receiverPhone || undefined,
      amount: parsedAmount,
      currency: 'ETB',
      dateTime: rawDate || undefined,
      status: 'FAILED',
      isReceiverMatched: false,
      errorMessage: `RECEIVER MISMATCH: Payment was credited to ${receiverName ? receiverName + ' (' + (receiverPhone || 'other') + ')' : receiverPhone || 'another account'}, NOT your official Telebirr (${targetPhone})!`,
    }
  }

  return {
    success: isSuccess,
    provider: 'TELEBIRR',
    reference: transactionId,
    payerName: payerName || undefined,
    payerAccountOrPhone: payerPhone || undefined,
    receiverName: receiverName || undefined,
    receiverAccount: receiverPhone || undefined,
    isReceiverMatched,
    amount: parsedAmount,
    currency: 'ETB',
    dateTime: rawDate || undefined,
    status: isSuccess ? 'COMPLETED' : 'FAILED',
    rawText: `${payerName || ''} -> ${receiverName || ''} (${parsedAmount || 0} ETB)`,
  }
}

/**
 * Verify Telebirr receipt by transaction ID, URL, or SuperApp QR code
 * Official endpoint: https://transactioninfo.ethiotelecom.et/receipt/{id}
 */
export async function verifyTelebirrReceipt(
  idOrUrl: string,
  accountDigits?: string,
  providedHtml?: string
): Promise<VerifiedReceipt> {
  const clean = cleanReference(idOrUrl)
  if (!clean) {
    return {
      success: false,
      provider: 'TELEBIRR',
      reference: '',
      currency: 'ETB',
      status: 'FAILED',
      errorMessage: 'Telebirr transaction ID or receipt URL is required',
    }
  }

  // Extract ID using helper (handles URLs, raw codes, SMS, and Base64 EMVCo QR codes)
  const transactionId = extractTelebirrTransactionId(idOrUrl)

  // ⚡ Option B: Direct Device-Level Fetch (phone already fetched the slip on device network)
  if (providedHtml && providedHtml.length > 200) {
    return parseTelebirrReceiptHtml(providedHtml, transactionId, accountDigits)
  }

  const fetchUrl = `https://transactioninfo.ethiotelecom.et/receipt/${transactionId}`

  try {
    const res = await fetchTelebirrWithRetry(fetchUrl, 3)

    if (!res.ok) {
      return {
        success: false,
        provider: 'TELEBIRR',
        reference: transactionId,
        currency: 'ETB',
        status: 'FAILED',
        errorMessage: `Telebirr server returned HTTP ${res.status}`,
      }
    }

    const html = await res.text()
    return parseTelebirrReceiptHtml(html, transactionId, accountDigits)
  } catch (err: any) {
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout')
    return {
      success: false,
      provider: 'TELEBIRR',
      reference: transactionId,
      currency: 'ETB',
      status: isTimeout ? 'PENDING' : 'FAILED',
      isTimeout,
      errorMessage: isTimeout
        ? 'Ethio Telecom receipt gateway timed out. Tap "View Official Slip in Browser" below to open the official receipt directly on your device network.'
        : `Verification error: ${err.message || String(err)}`,
    }
  }
}

/**
 * Verify modern CBE mobile banking receipt via official CBE API
 * Official endpoint: https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/{id}
 */
export async function verifyModernCbeReceipt(tokenId: string): Promise<VerifiedReceipt> {
  const cleanToken = cleanReference(tokenId).replace(/^https?:\/\/(?:mbrecie?pt|mb)\.cbe\.com\.et\//i, '')
  const fetchUrl = `https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/${cleanToken}`

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-App-ID': 'd1292e42-7400-49de-a2d3-9731caa4c819',
        'X-App-Version': '0a01980b-9859-1369-8198-59f403820000',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      return {
        success: false,
        provider: 'CBE',
        reference: cleanToken,
        currency: 'ETB',
        status: 'FAILED',
        errorMessage: `CBE returned HTTP ${res.status}. Receipt may be expired or invalid.`,
      }
    }

    const data = await res.json()
    const amountVal = parseFloat(data.amountCredited || data.debitAmount || '0')
    const isSuccess = data.status === 'COMPLETED' || data.status === 'SUCCESS' || /complete|success/i.test(data.status || '')

    // Check receiver account against configured settings
    const settings = await getPaymentSettings()
    let isReceiverMatched = true
    if (settings.cbeReceiverAccount && settings.cbeReceiverAccount.trim()) {
      isReceiverMatched = matchMaskedAccountOrPhone(settings.cbeReceiverAccount, data.creditAccountNo)
    }

    if (isSuccess && !isReceiverMatched) {
      return {
        success: false,
        provider: 'CBE',
        reference: data.id || cleanToken,
        payerName: data.debitAccountHolder || undefined,
        payerAccountOrPhone: data.debitAccountNo || undefined,
        receiverName: data.creditAccountHolder || undefined,
        receiverAccount: data.creditAccountNo || undefined,
        amount: isNaN(amountVal) ? undefined : amountVal,
        currency: data.creditCurrency || data.debitCurrency || 'ETB',
        dateTime: data.dateTimes?.[0] || undefined,
        status: 'FAILED',
        isReceiverMatched: false,
        errorMessage: `RECEIVER MISMATCH: Payment was credited to account ${data.creditAccountNo || 'another account'}, NOT your official CBE account (${settings.cbeReceiverAccount})!`,
      }
    }

    return {
      success: isSuccess,
      provider: 'CBE',
      reference: data.id || cleanToken,
      payerName: data.debitAccountHolder || undefined,
      payerAccountOrPhone: data.debitAccountNo || undefined,
      receiverName: data.creditAccountHolder || undefined,
      receiverAccount: data.creditAccountNo || undefined,
      isReceiverMatched,
      amount: isNaN(amountVal) ? undefined : amountVal,
      currency: data.creditCurrency || data.debitCurrency || 'ETB',
      dateTime: data.dateTimes?.[0] || undefined,
      status: isSuccess ? 'COMPLETED' : 'FAILED',
      rawText: `${data.debitAccountHolder || ''} -> ${data.creditAccountHolder || ''} (${amountVal} ETB, Ref: ${data.id || cleanToken})`,
    }
  } catch (err: any) {
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout')
    return {
      success: false,
      provider: 'CBE',
      reference: cleanToken,
      currency: 'ETB',
      status: isTimeout ? 'PENDING' : 'FAILED',
      isTimeout,
      errorMessage: isTimeout
        ? 'CBE server timed out. Tap "Open Official CBE Slip in Browser" below.'
        : `CBE verification error: ${err.message || String(err)}`,
    }
  }
}

/**
 * Validate that an external URL strictly belongs to approved Ethiopian banking domains
 * Prevents Server-Side Request Forgery (SSRF) into local network or unauthorized hosts
 */
export function isValidBankUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const hostname = parsed.hostname.toLowerCase()

    // Explicitly block loopback, link-local, and private RFC-1918 networks
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false
    }

    // Permitted official bank domains
    const allowed = [
      'cbe.com.et',
      'apps.cbe.com.et',
      'mb.cbe.com.et',
      'mbreciept.cbe.com.et',
      'mbreceipt.cbe.com.et',
      'ethiotelecom.et',
      'transactioninfo.ethiotelecom.et',
    ]

    return allowed.some(domain => hostname === domain || hostname.endsWith('.' + domain))
  } catch {
    return false
  }
}

/**
 * Verify Commercial Bank of Ethiopia (CBE) receipt
 * Supports both modern mbreciept.cbe.com.et QR links and legacy apps.cbe.com.et:100 FT references
 */
export async function verifyCbeReceipt(
  ftNumberOrUrl: string,
  accountDigits?: string
): Promise<VerifiedReceipt> {
  const clean = cleanReference(ftNumberOrUrl)
  if (!clean) {
    return {
      success: false,
      provider: 'CBE',
      reference: '',
      currency: 'ETB',
      status: 'FAILED',
      errorMessage: 'CBE FT reference or slip URL is required',
    }
  }

  // 1. Check for modern CBE mobile banking receipt link or token (mbreciept.cbe.com.et/{token} or v2-{token})
  const modernMatch = clean.match(/(?:(?:mbrecie?pt|mb)\.cbe\.com\.et\/|^)(v2-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{16,})/i)
  if (modernMatch) {
    const tokenId = modernMatch[1]
    return verifyModernCbeReceipt(tokenId)
  }

  let fetchUrl = clean
  let ftCode = clean.toUpperCase()

  // Use provided account digits or default configured account from settings
  const settings = await getPaymentSettings()
  const targetAcc = (accountDigits && accountDigits.trim().length > 0)
    ? accountDigits.trim()
    : (settings.cbeReceiverAccount || DEFAULT_CBE_ACCOUNT || '')

  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    if (!isValidBankUrl(clean)) {
      return {
        success: false,
        provider: 'CBE',
        reference: clean,
        currency: 'ETB',
        status: 'FAILED',
        errorMessage: 'Invalid receipt URL domain. Only official CBE and Telebirr verification domains are permitted.',
      }
    }
    fetchUrl = clean
    const match = clean.match(/[?&]id=([A-Za-z0-9]+)/i)
    if (match) ftCode = match[1].slice(0, 12).toUpperCase()
  } else {

    // Construct CBE URL: FT code + last 8 digits of account if available
    const cleanFt = clean.toUpperCase()
    const cleanAcc = targetAcc.replace(/\D/g, '')

    if (cleanFt.length > 12 && !accountDigits) {
      // User passed full id (FT code + account digits combined)
      fetchUrl = `https://apps.cbe.com.et:100/?id=${cleanFt}`
      ftCode = cleanFt.slice(0, 12)
    } else if (cleanAcc.length >= 8) {
      const last8 = cleanAcc.slice(-8)
      fetchUrl = `https://apps.cbe.com.et:100/?id=${cleanFt}${last8}`
      ftCode = cleanFt
    } else {
      fetchUrl = `https://apps.cbe.com.et:100/?id=${cleanFt}`
      ftCode = cleanFt
    }
  }

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      const isMissingAccount = ftCode.length === 12 && !targetAcc
      return {
        success: false,
        provider: 'CBE',
        reference: ftCode,
        currency: 'ETB',
        status: 'FAILED',
        errorMessage: isMissingAccount
          ? 'CBE requires the last 8 digits of your receiving account to verify an FT code (e.g. FT26287TNCW3 + your account last 8 digits), or scan the customer\'s QR code directly.'
          : `CBE verification server returned HTTP ${res.status}. Please check the reference code or link.`,
      }
    }

    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('pdf')) {
      const isMissingAccount = ftCode.length === 12 && !targetAcc
      return {
        success: false,
        provider: 'CBE',
        reference: ftCode,
        currency: 'ETB',
        status: 'FAILED',
        errorMessage: isMissingAccount
          ? 'CBE requires the last 8 digits of the receiving account to verify this FT reference. Please enter the last 8 digits or scan the customer\'s QR code.'
          : 'Invalid CBE reference. No transaction PDF found on CBE server.',
      }
    }

    const buf = Buffer.from(await res.arrayBuffer())

    // Parse PDF text using pdf-parse/lib/pdf-parse.js
    const pdfParse = require('pdf-parse/lib/pdf-parse.js')
    const pdfData = await pdfParse(buf)
    const text = pdfData?.text || ''

    const payerMatch = text.match(/Payer\s*:?\s*([^\n]+)/i)
    const payerAccMatch = text.match(/Payer\s*:?\s*[^\n]+\nAccount\s*:?\s*([^\n]+)/i)
    const receiverMatch = text.match(/Receiver\s*:?\s*([^\n]+)/i)
    const receiverAccMatch = text.match(/Receiver\s*:?\s*[^\n]+\nAccount\s*:?\s*([^\n]+)/i)
    const dateMatch = text.match(/Payment Date & Time\s*:?\s*([^\n]+)/i)
    const refMatch = text.match(/Reference No.*?(FT[A-Z0-9]+)/i)
    const amountMatch =
      text.match(/Transferred Amount\s*:?\s*([\d,.]+)\s*(?:ETB)?/i) ||
      text.match(/Total amount debited.*?\s*([\d,.]+)\s*(?:ETB)?/i)

    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined
    const extractedRef = refMatch ? refMatch[1].trim() : ftCode

    const parsedReceiverAcc = receiverAccMatch ? receiverAccMatch[1].trim() : ''
    let isReceiverMatched = true
    if (targetAcc && targetAcc.trim()) {
      isReceiverMatched = matchMaskedAccountOrPhone(targetAcc, parsedReceiverAcc)
    }

    if (!isReceiverMatched) {
      return {
        success: false,
        provider: 'CBE',
        reference: extractedRef,
        payerName: payerMatch ? payerMatch[1].trim() : undefined,
        payerAccountOrPhone: payerAccMatch ? payerAccMatch[1].trim() : undefined,
        receiverName: receiverMatch ? receiverMatch[1].trim() : undefined,
        receiverAccount: parsedReceiverAcc || undefined,
        amount,
        currency: 'ETB',
        dateTime: dateMatch ? dateMatch[1].trim() : undefined,
        status: 'FAILED',
        isReceiverMatched: false,
        errorMessage: `RECEIVER MISMATCH: Payment was credited to CBE account ${parsedReceiverAcc || 'another account'}, NOT your official CBE account (${targetAcc})!`,
      }
    }

    return {
      success: true,
      provider: 'CBE',
      reference: extractedRef,
      payerName: payerMatch ? payerMatch[1].trim() : undefined,
      payerAccountOrPhone: payerAccMatch ? payerAccMatch[1].trim() : undefined,
      receiverName: receiverMatch ? receiverMatch[1].trim() : undefined,
      receiverAccount: parsedReceiverAcc || undefined,
      isReceiverMatched,
      amount,
      currency: 'ETB',
      dateTime: dateMatch ? dateMatch[1].trim() : undefined,
      status: 'COMPLETED',
      rawText: text.slice(0, 300),
    }
  } catch (err: any) {
    return {
      success: false,
      provider: 'CBE',
      reference: ftCode,
      currency: 'ETB',
      status: 'FAILED',
      errorMessage: err.name === 'TimeoutError' || err.message?.includes('timeout')
        ? 'CBE server timed out. Please check your internet connection or verify manually.'
        : `CBE verification error: ${err.message || String(err)}`,
    }
  }
}

/**
 * Universal Receipt Verifier
 * Auto-detects whether the input is a Telebirr code/link, CBE code/link, etc.
 */
export async function verifyEthioReceipt(params: VerifyReceiptParams): Promise<VerifiedReceipt> {
  const { provider, referenceOrUrl, accountDigits } = params
  const clean = cleanReference(referenceOrUrl)

  if (!clean) {
    return {
      success: false,
      provider: 'UNKNOWN',
      reference: '',
      currency: 'ETB',
      status: 'FAILED',
      errorMessage: 'Transaction reference or receipt link is required',
    }
  }

  // Detect based on explicit provider or pattern
  const isCbe =
    provider === 'CBE' ||
    clean.toUpperCase().startsWith('FT') ||
    /cbe\.com\.et/i.test(clean) ||
    clean.startsWith('v2-') ||
    /mbrecie?pt/i.test(clean)

  const extractedTelebirrId = extractTelebirrTransactionId(clean)
  const isTelebirr =
    provider === 'TELEBIRR' ||
    clean.includes('ethiotelecom.et') ||
    clean.includes('telebirr') ||
    clean.startsWith('ODAx') ||
    clean.startsWith('8018') ||
    (!isCbe && extractedTelebirrId !== clean && /^[A-Za-z0-9]{8,14}$/.test(extractedTelebirrId)) ||
    (!isCbe && clean.length <= 16 && /^[A-Z0-9]+$/i.test(clean))

  if (isCbe) {
    return verifyCbeReceipt(clean, accountDigits)
  }

  if (isTelebirr) {
    return verifyTelebirrReceipt(clean, accountDigits, params.htmlContent)
  }

  // Fallback to Telebirr attempt
  return verifyTelebirrReceipt(clean, accountDigits, params.htmlContent)
}
