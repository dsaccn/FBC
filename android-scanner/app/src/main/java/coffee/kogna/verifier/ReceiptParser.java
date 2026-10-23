package coffee.kogna.verifier;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure parsing and validation logic for Telebirr and CBE payment receipts.
 * Decoupled from Android runtime dependencies to allow robust JVM unit testing.
 */
public final class ReceiptParser {

    private ReceiptParser() {}

    public static class DetectedPayment {
        public String provider = "UNKNOWN";
        public String reference = "";
        public String slipUrl = "";
        public boolean isTelebirr = false;
        public boolean isCbe = false;
        public boolean isBoa = false;
        public boolean isAwash = false;
        public boolean isDashen = false;
    }

    public static class TelebirrReceipt {
        public boolean isValid = false;
        public boolean isCompleted = false;
        public boolean isNotFound = false; // bank explicitly returned "not found" — reference doesn't exist
        public String status = "";
        public String reference = "";
        public double amount = 0.0;
        public String payerName = "";
        public String payerPhone = "";
        public String receiverName = "";
        public String receiverPhone = "";
        public String dateTime = "-";
    }

    public static class CbeReceipt {
        public boolean isValid = false;
        public boolean isCompleted = false;
        public String status = "";
        public String reference = "";
        public double amount = 0.0;
        public String payerName = "";
        public String payerAccount = "";
        public String receiverName = "";
        public String receiverAccount = "";
        public String dateTime = "-";
    }

    /**
     * Parse raw scan data (URL, QR code, Base64 payload, or SMS string) into payment details.
     */
    public static DetectedPayment detectPayment(String rawInput) {
        DetectedPayment res = new DetectedPayment();
        if (rawInput == null || rawInput.trim().isEmpty()) {
            return res;
        }
        String clean = rawInput.trim();

        // 0a. BOA QR code: "{trxId}\BNK" or "{trxId}|BNK" — Bank of Abyssinia native QR format
        //     Must run BEFORE CBE FT rule because BOA trxIds often start with "FT" (interbank ref).
        Matcher boaQrMatch = Pattern.compile("^([A-Za-z0-9_-]+)[\\\\|/]BNK\\b", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (boaQrMatch.find()) {
            String trxId = boaQrMatch.group(1);
            res.provider = "BOA";
            res.reference = trxId;
            res.slipUrl = "https://cs.bankofabyssinia.com/slip/?trx=" + trxId;
            res.isBoa = true;
            return res;
        }

        // 0b. BOA slip URL: cs.bankofabyssinia.com/slip/?trx=...
        if (clean.toLowerCase().contains("bankofabyssinia.com")) {
            Matcher boaUrlMatch = Pattern.compile("[?&]trx=([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(clean);
            String trxId = boaUrlMatch.find() ? boaUrlMatch.group(1) : clean.replaceAll(".*[?&]trx=", "").split("[&#]")[0];
            res.provider = "BOA";
            res.reference = trxId.isEmpty() ? clean : trxId;
            res.slipUrl = clean.startsWith("http") ? clean : "https://cs.bankofabyssinia.com/slip/?trx=" + trxId;
            res.isBoa = true;
            return res;
        }

        // 0c. Awash slip URL: awashpay.awashbank.com:8225/-{id}
        if (clean.toLowerCase().contains("awashbank.com")) {
            Matcher awashMatch = Pattern.compile("awashpay\\.awashbank\\.com[^/]*/-([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(clean);
            String txId = awashMatch.find() ? awashMatch.group(1) : "";
            res.provider = "AWASH";
            res.reference = txId.isEmpty() ? clean : txId;
            res.slipUrl = clean.startsWith("http") ? clean : "https://awashpay.awashbank.com:8225/-" + txId;
            res.isAwash = true;
            return res;
        }

        // 0d. Dashen slip URL: receipt.dashensuperapp.com/receipt/{id}
        if (clean.toLowerCase().contains("dashensuperapp.com")) {
            Matcher dashenMatch = Pattern.compile("/receipt/([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(clean);
            String txId = dashenMatch.find() ? dashenMatch.group(1) : "";
            res.provider = "DASHEN";
            res.reference = txId.isEmpty() ? clean : txId;
            res.slipUrl = clean.startsWith("http") ? clean : "https://receipt.dashensuperapp.com/receipt/" + txId;
            res.isDashen = true;
            return res;
        }

        // 1. CBE Modern Mobile Banking QR code / URL (mbreciept.cbe.com.et/v2-... or mb.cbe.com.et/...)
        Matcher cbeV2Url = Pattern.compile("(?:https?://)?(?:mbrecie?pt|mb)\\.cbe\\.com\\.et/(v2-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{16,})", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (cbeV2Url.find()) {
            String token = cbeV2Url.group(1).replaceAll("[?#].*$", "").replaceAll("/+$", "");
            res.provider = "CBE";
            res.reference = token;
            res.slipUrl = "https://mbreciept.cbe.com.et/" + token;
            res.isCbe = true;
            return res;
        }

        // Direct v2 token
        Matcher directV2 = Pattern.compile("^(v2-[A-Za-z0-9_-]{8,})", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (directV2.find()) {
            String token = directV2.group(1).replaceAll("[?#].*$", "").replaceAll("/+$", "");
            res.provider = "CBE";
            res.reference = token;
            res.slipUrl = "https://mbreciept.cbe.com.et/" + token;
            res.isCbe = true;
            return res;
        }

        // 2. CBE Legacy FT URL: [?&]id=([A-Za-z0-9]+)
        Matcher cbeFtUrl = Pattern.compile("[?&]id=([A-Za-z0-9]+)", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (cbeFtUrl.find()) {
            String fullId = cbeFtUrl.group(1).toUpperCase();
            if (fullId.startsWith("FT")) {
                String ft = fullId.length() > 12 ? fullId.substring(0, 12) : fullId;
                ft = normalizeOcrReference("CBE", ft);
                res.provider = "CBE";
                res.reference = ft;
                res.slipUrl = "https://apps.cbe.com.et:100/?id=" + ft;
                res.isCbe = true;
                return res;
            }
        }

        // Direct FT code
        Matcher directFt = Pattern.compile("\\b(FT[0-9A-Za-z]{8,14})\\b", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (directFt.find()) {
            String fullFt = directFt.group(1).toUpperCase();
            String ft = fullFt.length() > 12 ? fullFt.substring(0, 12) : fullFt;
            ft = normalizeOcrReference("CBE", ft);
            res.provider = "CBE";
            res.reference = ft;
            res.slipUrl = "https://apps.cbe.com.et:100/?id=" + ft;
            res.isCbe = true;
            return res;
        }

        // Any other CBE URL
        if (clean.toLowerCase().contains("cbe.com.et")) {
            Matcher tokenMatch = Pattern.compile("cbe\\.com\\.et/([A-Za-z0-9_-]{8,})", Pattern.CASE_INSENSITIVE).matcher(clean);
            String token = tokenMatch.find() ? tokenMatch.group(1).replaceAll("[?#].*$", "") : clean;
            res.provider = "CBE";
            res.reference = token;
            res.slipUrl = clean.startsWith("http") ? clean : "https://" + clean;
            res.isCbe = true;
            return res;
        }

        // 3. Telebirr URL: /receipt/([A-Za-z0-9_-]+)
        Matcher tbUrl = Pattern.compile("/receipt/([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (tbUrl.find()) {
            String code = normalizeOcrReference("TELEBIRR", tbUrl.group(1));
            res.provider = "TELEBIRR";
            res.reference = code;
            res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
            res.isTelebirr = true;
            return res;
        }

        // 4. Telebirr Base64 EMVCo SuperApp QR code
        if (clean.length() > 30 && clean.matches("^[A-Za-z0-9+/=\\s]+$")) {
            try {
                byte[] decoded = Base64.getDecoder().decode(clean.replaceAll("\\s+", ""));
                String isoString = new String(decoded, StandardCharsets.ISO_8859_1);
                Matcher emvMatch = Pattern.compile("000A([0-9a-fA-F]{20})", Pattern.CASE_INSENSITIVE).matcher(isoString);
                if (emvMatch.find()) {
                    String hex = emvMatch.group(1);
                    StringBuilder ascii = new StringBuilder();
                    for (int i = 0; i < hex.length() - 1; i += 2) {
                        ascii.append((char) Integer.parseInt(hex.substring(i, i + 2), 16));
                    }
                    String code = ascii.toString().trim().toUpperCase();
                    if (code.matches("^[A-Za-z0-9]{8,14}$")) {
                        code = normalizeOcrReference("TELEBIRR", code);
                        res.provider = "TELEBIRR";
                        res.reference = code;
                        res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
                        res.isTelebirr = true;
                        return res;
                    }
                }
            } catch (Exception ignored) {}
        }

        // 5. Amharic or English SMS text
        Matcher smsTagMatch = Pattern.compile("(?:የሂሳብ\\s*እንቅስቃሴ\\s*ቁጥር(?:ዎ)?|የግብይት\\s*ቁጥር|Transaction\\s*(?:number|no|id)|Txn\\s*ID|Receipt\\s*(?:no|number)|Ref(?:erence)?(?:\\s*No)?)[:\\s]+([A-Za-z0-9]{8,14})", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (smsTagMatch.find()) {
            String code = normalizeOcrReference("TELEBIRR", smsTagMatch.group(1));
            res.provider = "TELEBIRR";
            res.reference = code;
            res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
            res.isTelebirr = true;
            return res;
        }

        // 6. Standalone 10-char alphanumeric reference code (e.g. DJJ7261SX7)
        Matcher codeMatch = Pattern.compile("\\b([A-Za-z0-9]{10})\\b").matcher(clean);
        while (codeMatch.find()) {
            String candidate = codeMatch.group(1);
            if (!candidate.equalsIgnoreCase("TELEBIRR") && !candidate.equalsIgnoreCase("ETHIOTELE") &&
                !candidate.equalsIgnoreCase("COMMERCIAL") && !candidate.matches("^\\d+$") && !candidate.matches("^[A-Za-z]+$")) {
                String code = normalizeOcrReference("TELEBIRR", candidate);
                res.provider = "TELEBIRR";
                res.reference = code;
                res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
                res.isTelebirr = true;
                return res;
            }
        }

        // 7. Fallback
        String cleanedAlpha = clean.replaceAll("[^A-Za-z0-9_-]", "");
        if (cleanedAlpha.toUpperCase().startsWith("FT")) {
            res.provider = "CBE";
            res.reference = normalizeOcrReference("CBE", cleanedAlpha);
            res.slipUrl = "https://apps.cbe.com.et:100/?id=" + res.reference;
            res.isCbe = true;
        } else {
            res.provider = "TELEBIRR";
            res.reference = normalizeOcrReference("TELEBIRR", cleanedAlpha);
            res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + res.reference;
            res.isTelebirr = true;
        }
        return res;
    }

    /**
     * Normalize OCR misread characters in Ethiopian payment references:
     * - In Telebirr (e.g. DJM05ZHSXC), OCR engines (Google ML Kit) consistently confuse
     *   the digit '0' (zero) with the uppercase letter 'O'. Telebirr transaction codes
     *   use digit 0, never letter O.
     * - In CBE FT codes, the first 5 characters after FT (positions 2-6, e.g. FT26295...) are strictly
     *   digits (year YY + day-of-year DDD), where OCR frequently confuses 'O'->'0', 'I'/'L'->'1', 'S'->'5'.
     */
    public static String normalizeOcrReference(String provider, String rawRef) {
        if (rawRef == null) return "";
        String ref = rawRef.trim().toUpperCase();

        if ("TELEBIRR".equalsIgnoreCase(provider) || ref.startsWith("DJ") || ref.contains("TRANSACTIONINFO")) {
            // Fix OCR misreading digit 0 as letter O in Telebirr
            return ref.replace('O', '0');
        }

        if ("CBE".equalsIgnoreCase(provider) || ref.startsWith("FT")) {
            if (ref.startsWith("FT") && ref.length() >= 7) {
                char[] chars = ref.toCharArray();
                for (int i = 2; i < Math.min(7, chars.length); i++) {
                    if (chars[i] == 'O') chars[i] = '0';
                    else if (chars[i] == 'I' || chars[i] == 'L') chars[i] = '1';
                    else if (chars[i] == 'S') chars[i] = '5';
                    else if (chars[i] == 'B') chars[i] = '8';
                }
                return new String(chars);
            }
        }

        return ref;
    }

    /**
     * High-precision extraction of Ethiopian payment references from live OCR text (camera frames, SMS, USSD screens).
     * Returns null if no high-confidence payment reference is found, preventing false positives on random text.
     */
    public static DetectedPayment extractReferenceFromOcrText(String ocrText) {
        if (ocrText == null || ocrText.trim().isEmpty()) {
            return null;
        }

        // 1. Direct Telebirr receipt URL in SMS or screen (e.g. https://transactioninfo.ethiotelecom.et/receipt/DJM05ZHSXC)
        Matcher tbUrl = Pattern.compile("(?:https?://)?(?:www\\.)?transactioninfo\\.ethiotelecom\\.et/receipt/([A-Za-z0-9_-]{8,14})", Pattern.CASE_INSENSITIVE).matcher(ocrText);
        if (tbUrl.find()) {
            String code = normalizeOcrReference("TELEBIRR", tbUrl.group(1));
            DetectedPayment res = new DetectedPayment();
            res.provider = "TELEBIRR";
            res.reference = code;
            res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
            res.isTelebirr = true;
            return res;
        }

        // 2. CBE FT code in USSD/SMS (e.g. FT26295ZFD3H - exactly 12 characters, starting with FT)
        Matcher ftMatch = Pattern.compile("\\b(FT[0-9A-Za-z]{10})\\b", Pattern.CASE_INSENSITIVE).matcher(ocrText);
        if (ftMatch.find()) {
            String ft = normalizeOcrReference("CBE", ftMatch.group(1));
            DetectedPayment res = new DetectedPayment();
            res.provider = "CBE";
            res.reference = ft;
            res.slipUrl = "https://apps.cbe.com.et:100/?id=" + ft;
            res.isCbe = true;
            return res;
        }

        // 3. Modern CBE Mobile Banking v2 token or URL (mbreciept.cbe.com.et/v2-...)
        Matcher cbeV2Match = Pattern.compile("(?:(?:https?://)?(?:mbrecie?pt|mb)\\.cbe\\.com\\.et/)?\\b(v2-[A-Za-z0-9_-]{10,})\\b", Pattern.CASE_INSENSITIVE).matcher(ocrText);
        if (cbeV2Match.find()) {
            String token = cbeV2Match.group(1).replaceAll("[?#].*$", "");
            DetectedPayment res = new DetectedPayment();
            res.provider = "CBE";
            res.reference = token;
            res.slipUrl = "https://mbreciept.cbe.com.et/" + token;
            res.isCbe = true;
            return res;
        }

        // 4. Telebirr tagged SMS reference (Amharic "የሂሳብ እንቅስቃሴ ቁጥርዎ", "የግብይት ቁጥር", or English "Txn ID", "Transaction No")
        Matcher tbTagMatch = Pattern.compile("(?:የሂሳብ\\s*እንቅስቃሴ\\s*ቁጥር(?:ዎ)?|የግብይት\\s*ቁጥር|Transaction\\s*(?:number|no|id)|Txn\\s*ID|Receipt\\s*(?:no|number)|Ref(?:erence)?(?:\\s*No)?)[:\\s]+([A-Za-z0-9]{8,14})", Pattern.CASE_INSENSITIVE).matcher(ocrText);
        if (tbTagMatch.find()) {
            String code = normalizeOcrReference("TELEBIRR", tbTagMatch.group(1));
            DetectedPayment res = new DetectedPayment();
            res.provider = "TELEBIRR";
            res.reference = code;
            res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
            res.isTelebirr = true;
            return res;
        }

        // 5. High-confidence Telebirr code pattern starting with "DJ" (standard Telebirr prefix like DJM05ZHSXC, DJJ7261SX7)
        Matcher djMatch = Pattern.compile("\\b(DJ[0-9A-Za-z]{8})\\b", Pattern.CASE_INSENSITIVE).matcher(ocrText);
        if (djMatch.find()) {
            String code = normalizeOcrReference("TELEBIRR", djMatch.group(1));
            DetectedPayment res = new DetectedPayment();
            res.provider = "TELEBIRR";
            res.reference = code;
            res.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + code;
            res.isTelebirr = true;
            return res;
        }

        return null;
    }

    /**
     * Parse HTML returned by Telebirr web receipt endpoint.
     */
    public static TelebirrReceipt parseTelebirrReceiptHtml(String reference, String html) {
        TelebirrReceipt res = new TelebirrReceipt();
        res.reference = reference != null ? reference : "";

        if (html == null || html.length() < 300) {
            return res;
        }
        if (html.contains("This request is not correct") || html.contains("not found") || html.contains("Invalid transaction")) {
            res.isNotFound = true;
            return res;
        }

        // Status check: In the official HTML, the transaction status label td has no closing </td>
        Matcher statusMatch = Pattern.compile("transaction\\s*status[\\s\\S]*?<td[^>]*>\\s*([^<]*?)\\s*<", Pattern.CASE_INSENSITIVE).matcher(html);
        if (statusMatch.find()) {
            res.status = statusMatch.group(1).trim();
            res.isCompleted = Pattern.compile("completed|success|approved", Pattern.CASE_INSENSITIVE).matcher(res.status).find();
        }

        res.payerName = extractHtmlField(html, "Payer\\s*Name");
        res.payerPhone = extractHtmlField(html, "Payer\\s*telebirr");
        res.receiverName = extractHtmlField(html, "Credited\\s*Party\\s*name");
        res.receiverPhone = extractHtmlField(html, "Credited\\s*party\\s*account\\s*no");
        if (res.receiverPhone == null || res.receiverPhone.isEmpty()) {
            res.receiverPhone = extractHtmlField(html, "Receiver\\s*telebirr");
        }

        double parsedAmt = 0.0;
        Matcher settledMatch = Pattern.compile("(?:Settled\\s*Amount|የተከፈለው\\s*መጠን)[\\s\\S]*?([\\d,.]+)\\s*Birr", Pattern.CASE_INSENSITIVE).matcher(html);
        if (settledMatch.find()) {
            parsedAmt = parseDoubleSafe(settledMatch.group(1));
        } else {
            Matcher totalPaidMatch = Pattern.compile("(?:Total\\s*Paid\\s*Amount|ጠቅላላ\\s*የተከፈለ)[\\s\\S]*?([\\d,.]+)\\s*Birr", Pattern.CASE_INSENSITIVE).matcher(html);
            if (totalPaidMatch.find()) {
                parsedAmt = parseDoubleSafe(totalPaidMatch.group(1));
            }
        }
        res.amount = parsedAmt;

        Matcher dateMatch = Pattern.compile("(\\d{2}-\\d{2}-\\d{4}\\s+\\d{2}:\\d{2}:\\d{2})").matcher(html);
        if (dateMatch.find()) {
            res.dateTime = dateMatch.group(1);
        }

        res.isValid = true;
        return res;
    }

    /**
     * Parse JSON returned by CBE Modern mobile banking public endpoint.
     */
    public static CbeReceipt parseCbeJson(String fallbackToken, JSONObject data) {
        CbeReceipt res = new CbeReceipt();
        if (data == null) return res;

        String status = data.optString("status", "");
        res.status = status;
        res.isCompleted = status.equalsIgnoreCase("COMPLETED") ||
                          status.equalsIgnoreCase("SUCCESS") ||
                          Pattern.compile("complete|success", Pattern.CASE_INSENSITIVE).matcher(status).find();

        double parsedAmount = data.optDouble("amountCredited", 0.0);
        if (parsedAmount <= 0) {
            parsedAmount = data.optDouble("debitAmount", 0.0);
        }
        if (parsedAmount <= 0 && data.has("amount")) {
            parsedAmount = parseDoubleSafe(data.optString("amount"));
        }
        res.amount = parsedAmount;

        res.payerName = data.optString("debitAccountHolder", data.optString("payerName", "Customer"));
        res.payerAccount = data.optString("debitAccountNo", "");
        res.receiverName = data.optString("creditAccountHolder", data.optString("receiverName", ""));
        res.receiverAccount = data.optString("creditAccountNo", "");

        JSONArray dateTimes = data.optJSONArray("dateTimes");
        if (dateTimes != null && dateTimes.length() > 0) {
            res.dateTime = dateTimes.optString(0, "-");
        } else {
            res.dateTime = data.optString("transactionDate", data.optString("date", "-"));
        }

        res.reference = data.optString("id", fallbackToken != null ? fallbackToken : "");
        res.isValid = true;
        return res;
    }

    /**
     * Safely verify if a received account or phone number matches the target account/phone,
     * handling masked digits (e.g. "2519****2464", "1000****7818") and prefix variations.
     */
    public static boolean matchMaskedAccountOrPhone(String target, String received) {
        if (target == null || target.trim().isEmpty()) return true; // No restriction configured
        if (received == null || received.trim().isEmpty()) return false; // Target configured, but received empty

        String cleanTarget = target.trim().replaceAll("\\D", "");
        if (cleanTarget.length() < 4) return true;

        String rawReceived = received.trim();

        // 1. If received contains masking characters (*, X, x, #, .)
        if (rawReceived.matches(".*[*Xx#.].*")) {
            Matcher suffixMatcher = Pattern.compile("(\\d{3,})$").matcher(rawReceived);
            String suffix = suffixMatcher.find() ? suffixMatcher.group(1) : "";

            Matcher prefixMatcher = Pattern.compile("^(\\d+)").matcher(rawReceived);
            String prefix = prefixMatcher.find() ? prefixMatcher.group(1) : "";

            // Suffix verification: Target must end with the suffix digits
            if (!suffix.isEmpty() && suffix.length() >= 3) {
                if (!cleanTarget.endsWith(suffix)) {
                    return false;
                }
            }

            // Prefix verification: Target (or normalized target) must start with prefix
            if (!prefix.isEmpty() && prefix.length() >= 1) {
                String targetWithoutCountryCode = cleanTarget.replaceFirst("^251", "0");
                String targetInternational = cleanTarget.startsWith("0") ? "251" + cleanTarget.substring(1) : cleanTarget;
                boolean matchesPrefix = cleanTarget.startsWith(prefix)
                        || targetWithoutCountryCode.startsWith(prefix)
                        || targetInternational.startsWith(prefix);

                if (!matchesPrefix) {
                    return false;
                }
            }

            return true;
        }

        // 2. If received is not masked (full or partial digits)
        String cleanReceived = rawReceived.replaceAll("\\D", "");
        if (cleanReceived.isEmpty()) return true;

        if (cleanReceived.length() >= 4) {
            if (cleanTarget.endsWith(cleanReceived) || cleanReceived.endsWith(cleanTarget)) {
                return true;
            }
            int checkLen = Math.min(Math.min(cleanTarget.length(), cleanReceived.length()), 8);
            if (checkLen >= 4) {
                String tSub = cleanTarget.substring(cleanTarget.length() - checkLen);
                String rSub = cleanReceived.substring(cleanReceived.length() - checkLen);
                if (tSub.equals(rSub)) {
                    return true;
                }
            }
        }

        return cleanTarget.contains(cleanReceived) || cleanReceived.contains(cleanTarget);
    }

    /**
     * Safely parse double from currency strings like "1,500.50".
     */
    public static double parseDoubleSafe(String val) {
        if (val == null || val.trim().isEmpty()) return 0.0;
        try {
            String clean = val.replaceAll(",", "").trim();
            Matcher m = Pattern.compile("([\\d.]+)").matcher(clean);
            if (m.find()) {
                return Double.parseDouble(m.group(1));
            }
        } catch (Exception ignored) {}
        return 0.0;
    }

    /**
     * Extract field value from HTML table: label -> value pair.
     */
    public static String extractHtmlField(String html, String fieldPattern) {
        if (html == null) return null;
        Matcher m = Pattern.compile(fieldPattern + "[^<]*</t[dh]>\\s*<td[^>]*>([\\s\\S]*?)</td>", Pattern.CASE_INSENSITIVE).matcher(html);
        if (m.find()) {
            return m.group(1).replaceAll("<[^>]+>", "").trim();
        }
        return null;
    }
}
