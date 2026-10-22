package coffee.kogna.verifier;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.*;

public class ReceiptParserTest {

    private String loadResource(String name) throws Exception {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(name)) {
            assertNotNull("Resource not found: " + name, is);
            byte[] bytes = is.readAllBytes();
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    @Test
    public void testDetectPayment() {
        // 1. Telebirr URL
        ReceiptParser.DetectedPayment p1 = ReceiptParser.detectPayment("https://transactioninfo.ethiotelecom.et/receipt/DJJ7261SX7");
        assertEquals("TELEBIRR", p1.provider);
        assertEquals("DJJ7261SX7", p1.reference);
        assertTrue(p1.isTelebirr);
        assertFalse(p1.isCbe);

        // 2. Raw 10-char ref
        ReceiptParser.DetectedPayment p2 = ReceiptParser.detectPayment("DJJ7261SX7");
        assertEquals("TELEBIRR", p2.provider);
        assertEquals("DJJ7261SX7", p2.reference);
        assertTrue(p2.isTelebirr);

        // 3. mbreciept.cbe.com.et/v2-... URL
        ReceiptParser.DetectedPayment p3 = ReceiptParser.detectPayment("https://mbreciept.cbe.com.et/v2-abc123xyz?param=1");
        assertEquals("CBE", p3.provider);
        assertEquals("v2-abc123xyz", p3.reference);
        assertTrue(p3.isCbe);

        // 4. FT code
        ReceiptParser.DetectedPayment p4 = ReceiptParser.detectPayment("FT24287ABCDE");
        assertEquals("CBE", p4.provider);
        assertEquals("FT24287ABCDE", p4.reference);
        assertTrue(p4.isCbe);

        // 5. ?id=FT... URL (with 8 trailing receiver account digits)
        ReceiptParser.DetectedPayment p5 = ReceiptParser.detectPayment("https://apps.cbe.com.et:100/?id=FT24287ABCDE12345678");
        assertEquals("CBE", p5.provider);
        assertEquals("FT24287ABCDE", p5.reference);
        assertTrue(p5.isCbe);
    }

    @Test
    public void testTelebirrValidHtml() throws Exception {
        String html = loadResource("telebirr_valid.html");
        ReceiptParser.TelebirrReceipt receipt = ReceiptParser.parseTelebirrReceiptHtml("DJJ7261SX7", html);

        assertTrue(receipt.isValid);
        assertTrue(receipt.isCompleted);
        assertEquals("Completed", receipt.status);
        assertEquals("DJJ7261SX7", receipt.reference);
        assertEquals("ABEBE KEBEDE TESFAYE", receipt.payerName);
        assertEquals("2519****1111", receipt.payerPhone);
        assertEquals("Kogna Coffee", receipt.receiverName);
        assertEquals("2519****2464", receipt.receiverPhone);
        assertEquals(150.0, receipt.amount, 0.001);
        assertEquals("19-10-2026 15:03:21", receipt.dateTime);
    }

    @Test
    public void testTelebirrPendingHtml() throws Exception {
        String html = loadResource("telebirr_pending.html");
        ReceiptParser.TelebirrReceipt receipt = ReceiptParser.parseTelebirrReceiptHtml("DJJ7261SX7", html);

        assertTrue(receipt.isValid);
        assertFalse("Pending status should not be completed", receipt.isCompleted);
        assertEquals("Pending", receipt.status);
    }

    @Test
    public void testTelebirrInvalidHtml() throws Exception {
        String html = loadResource("telebirr_invalid.html");
        ReceiptParser.TelebirrReceipt receipt = ReceiptParser.parseTelebirrReceiptHtml("DJJ7261SX7", html);

        assertFalse("Invalid page must produce invalid receipt", receipt.isValid);
        assertFalse(receipt.isCompleted);
    }

    @Test
    public void testCbeJsonParsing() throws Exception {
        JSONObject data = new JSONObject();
        data.put("id", "v2-cbe-test-123");
        data.put("status", "COMPLETED");
        data.put("amountCredited", "250.75");
        data.put("creditAccountNo", "1000****7818");
        data.put("creditAccountHolder", "Kogna Coffee");
        data.put("debitAccountHolder", "Chala Tolosa");
        data.put("debitAccountNo", "1000****4321");
        JSONArray dateTimes = new JSONArray();
        dateTimes.put("20-10-2026 11:20:00");
        data.put("dateTimes", dateTimes);

        ReceiptParser.CbeReceipt receipt = ReceiptParser.parseCbeJson("v2-fallback", data);

        assertTrue(receipt.isValid);
        assertTrue(receipt.isCompleted);
        assertEquals("v2-cbe-test-123", receipt.reference);
        assertEquals(250.75, receipt.amount, 0.001);
        assertEquals("Kogna Coffee", receipt.receiverName);
        assertEquals("1000****7818", receipt.receiverAccount);
        assertEquals("Chala Tolosa", receipt.payerName);
        assertEquals("1000****4321", receipt.payerAccount);
        assertEquals("20-10-2026 11:20:00", receipt.dateTime);
    }

    @Test
    public void testMaskedMatching() {
        // Telebirr masked phone matching
        assertTrue(ReceiptParser.matchMaskedAccountOrPhone("0912342464", "2519****2464"));
        assertTrue(ReceiptParser.matchMaskedAccountOrPhone("251912342464", "2519****2464"));
        assertFalse(ReceiptParser.matchMaskedAccountOrPhone("0912342464", "2519****9999"));

        // CBE masked account matching
        assertTrue(ReceiptParser.matchMaskedAccountOrPhone("100012347818", "1000****7818"));
        assertFalse(ReceiptParser.matchMaskedAccountOrPhone("100012347818", "1000****9999"));

        // Empty received account with target configured -> must fail
        assertFalse(ReceiptParser.matchMaskedAccountOrPhone("100012347818", ""));
        assertFalse(ReceiptParser.matchMaskedAccountOrPhone("100012347818", null));

        // Unconfigured target -> should allow
        assertTrue(ReceiptParser.matchMaskedAccountOrPhone("", "1000****7818"));
        assertTrue(ReceiptParser.matchMaskedAccountOrPhone(null, "1000****7818"));

        // Full unmasked match
        assertTrue(ReceiptParser.matchMaskedAccountOrPhone("100012347818", "100012347818"));
    }

    @Test
    public void testParseDoubleSafe() {
        assertEquals(1500.50, ReceiptParser.parseDoubleSafe("1,500.50 Birr"), 0.001);
        assertEquals(25.0, ReceiptParser.parseDoubleSafe("25"), 0.001);
        assertEquals(0.0, ReceiptParser.parseDoubleSafe(null), 0.001);
        assertEquals(0.0, ReceiptParser.parseDoubleSafe(""), 0.001);
    }

    @Test
    public void testExtractReferenceFromOcrText() {
        // 1. Real-World CBE USSD (*847#) Screen Confirmation
        String cbeUssdText = "Completed ETB1.71 transfer From Dawit Solomon Assefa to Kidist Temesgen Aregu-6501. To test on 22/10/2026 FT26295ZFD3H Service Charge #:Next";
        ReceiptParser.DetectedPayment cbeResult = ReceiptParser.extractReferenceFromOcrText(cbeUssdText);
        assertNotNull("CBE USSD reference should be detected", cbeResult);
        assertEquals("CBE", cbeResult.provider);
        assertEquals("FT26295ZFD3H", cbeResult.reference);
        assertTrue(cbeResult.isCbe);
        assertFalse(cbeResult.isTelebirr);

        // 2. Real-World Telebirr 127 SMS Confirmation
        String telebirrSmsText = "ውድSolomon\n" +
                "ወደ Eferem wondimu(0911****37) 1.00 ብር በ 22/10/2026 10:20:10 ልከዋል። የሂሳብ እንቅስቃሴ ቁጥርዎ DJM05ZHSXC ነው። " +
                "የአገልግሎት ክፍያው 0.87 ብር ፤ የአገልግሎት ክፍያው 15% VAT 0.13 ብር ነው። አሁን ያለዎት ቀሪ ሂሳብ 49.00 ብር ነው። " +
                "የክፍያ መረጃዎን ለማግኘት ማስፈንጠሪያውን ይጫኑ፡\n" +
                "https://transactioninfo.ethiotelecom.et/receipt/DJM05ZHSXC\n" +
                "በቴሌብር ስለተገለገሉ እናመሰግናለን\n" +
                "ኢትዮ ቴሌኮም";
        ReceiptParser.DetectedPayment tbResult = ReceiptParser.extractReferenceFromOcrText(telebirrSmsText);
        assertNotNull("Telebirr SMS reference should be detected", tbResult);
        assertEquals("TELEBIRR", tbResult.provider);
        assertEquals("DJM05ZHSXC", tbResult.reference);
        assertTrue(tbResult.isTelebirr);
        assertFalse(tbResult.isCbe);

        // 3. Telebirr SMS without link (only Amharic text)
        String tbAmharicOnly = "የሂሳብ እንቅስቃሴ ቁጥርዎ DJJ7261SX7 ነው። የ 200 ብር ክፍያ ተፈጽሟል።";
        ReceiptParser.DetectedPayment tbAmharicResult = ReceiptParser.extractReferenceFromOcrText(tbAmharicOnly);
        assertNotNull(tbAmharicResult);
        assertEquals("DJJ7261SX7", tbAmharicResult.reference);
        assertEquals("TELEBIRR", tbAmharicResult.provider);

        // 4. Modern CBE Mobile Banking v2 link
        String cbeV2Text = "Payment successful! View receipt at https://mbreciept.cbe.com.et/v2-948fha83hf928hf9";
        ReceiptParser.DetectedPayment v2Result = ReceiptParser.extractReferenceFromOcrText(cbeV2Text);
        assertNotNull(v2Result);
        assertEquals("v2-948fha83hf928hf9", v2Result.reference);
        assertEquals("CBE", v2Result.provider);

        // 5. Negative Test: Random cafe menu text or chatter should NEVER falsely trigger
        String randomMenuText = "Welcome to Kogna Coffee! Fresh Ethiopian Yirgacheffe, Macchiato, and Croissant. Total: 250 ETB.";
        assertNull("Random text must not produce a payment reference", ReceiptParser.extractReferenceFromOcrText(randomMenuText));
        assertNull("Empty text must return null", ReceiptParser.extractReferenceFromOcrText(""));
        assertNull("Null text must return null", ReceiptParser.extractReferenceFromOcrText(null));
    }
}
