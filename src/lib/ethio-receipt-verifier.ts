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
}

/**
 * Clean and normalize transaction ID / reference string
 */
export function cleanReference(raw: string): string {
  return (raw || '').trim().replace(/\s+/g, '')
}

/**
 * Extract Telebirr transaction ID from plain text, URL, or Telebirr SuperApp EMVCo QR code
 */
export function extractTelebirrTransactionId(raw: string): string {
  const clean = (raw || '').trim()
  if (!clean) return ''

  // 1. If it's a URL
  const urlMatch = clean.match(/\/receipt\/([A-Za-z0-9_-]+)/i)
  if (urlMatch) {
    return urlMatch[1].toUpperCase()
  }

  // 2. If it's a Base64-encoded Telebirr SuperApp QR code
  try {
    const decoded = Buffer.from(clean, 'base64').toString('utf8')
    const match = decoded.match(/000A([0-9a-fA-F]{20})/i)
    if (match) {
      const ascii = Buffer.from(match[1], 'hex').toString('utf8')
      if (/^[A-Za-z0-9]{8,14}$/.test(ascii)) {
        return ascii.toUpperCase()
      }
    }
  } catch {}

  // 3. If it's directly the decoded EMVCo string
  const directMatch = clean.match(/000A([0-9a-fA-F]{20})/i)
  if (directMatch) {
    try {
      const ascii = Buffer.from(directMatch[1], 'hex').toString('utf8')
      if (/^[A-Za-z0-9]{8,14}$/.test(ascii)) {
        return ascii.toUpperCase()
      }
    } catch {}
  }

  // 4. Default clean alphanumeric code
  return clean.toUpperCase()
}

/**
 * Verify Telebirr receipt by transaction ID, URL, or SuperApp QR code
 * Official endpoint: https://transactioninfo.ethiotelecom.et/receipt/{id}
 */
export async function verifyTelebirrReceipt(idOrUrl: string): Promise<VerifiedReceipt> {
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

  // Extract ID using helper (handles URLs, raw codes, and Base64 EMVCo QR codes)
  const transactionId = extractTelebirrTransactionId(clean)
  const fetchUrl = `https://transactioninfo.ethiotelecom.et/receipt/${transactionId}`

  try {
    const res = await fetch(fetchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    })

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

    // Helper regex to extract label -> value pairs in HTML table
    const extractField = (pattern: RegExp): string | undefined => {
      const match = html.match(pattern)
      return match ? match[1].replace(/<[^>]+>/g, '').trim() : undefined
    }

    const payerName = extractField(/Payer\s*Name[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i)
    const payerPhone = extractField(/Payer\s*telebirr[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i)
    const receiverName = extractField(/Credited\s*Party\s*name[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i)
    const receiverPhone = extractField(/Credited\s*party\s*account\s*no[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i)
    const rawStatus = extractField(/transaction\s*status[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i) || 'Completed'
    const rawAmount = extractField(/Total\s*Paid\s*Amount[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i) ||
                      extractField(/Settled\s*Amount[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i)
    const rawDate = extractField(/Payment\s*date[^<]*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/i)

    let parsedAmount: number | undefined
    if (rawAmount) {
      const numMatch = rawAmount.replace(/,/g, '').match(/[\d.]+/)
      if (numMatch) parsedAmount = parseFloat(numMatch[0])
    }

    const isSuccess = /completed|success|approved/i.test(rawStatus)

    // Check receiver phone/account against configured settings
    const settings = await getPaymentSettings()
    let isReceiverMatched = true
    if (settings.telebirrReceiverPhone && settings.telebirrReceiverPhone.trim()) {
      const cleanTarget = settings.telebirrReceiverPhone.replace(/\D/g, '').slice(-9)
      const cleanReceived = (receiverPhone || '').replace(/\D/g, '').slice(-9)
      if (cleanTarget && cleanReceived && cleanTarget !== cleanReceived) {
        isReceiverMatched = false
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
        errorMessage: `RECEIVER MISMATCH: Payment was credited to ${receiverPhone || receiverName || 'another account'}, NOT your official Telebirr (${settings.telebirrReceiverPhone})!`,
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
  const cleanToken = cleanReference(tokenId).replace(/^https?:\/\/mbreciept\.cbe\.com\.et\//i, '')
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
      const cleanTarget = settings.cbeReceiverAccount.replace(/\D/g, '').slice(-8)
      const cleanReceived = (data.creditAccountNo || '').replace(/\D/g, '').slice(-8)
      if (cleanTarget && cleanReceived && !cleanReceived.includes(cleanTarget)) {
        isReceiverMatched = false
      }
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
    return {
      success: false,
      provider: 'CBE',
      reference: cleanToken,
      currency: 'ETB',
      status: 'FAILED',
      errorMessage: err.name === 'TimeoutError' || err.message?.includes('timeout')
        ? 'CBE server timed out. Please check your internet connection.'
        : `CBE verification error: ${err.message || String(err)}`,
    }
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
  const modernMatch = clean.match(/(?:mbreciept\.cbe\.com\.et\/|^)(v2-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{16,})/i)
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
    if (targetAcc && targetAcc.length >= 8) {
      const cleanTarget = targetAcc.replace(/\D/g, '').slice(-8)
      const cleanReceived = parsedReceiverAcc.replace(/\D/g, '').slice(-8)
      if (cleanTarget && cleanReceived && !cleanReceived.includes(cleanTarget)) {
        isReceiverMatched = false
      }
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
    clean.includes('cbe.com.et') ||
    clean.startsWith('v2-') ||
    clean.includes('mbreciept')

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
    return verifyTelebirrReceipt(clean)
  }

  // Fallback to Telebirr attempt
  return verifyTelebirrReceipt(clean)
}
