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
        ReceiptParser.DetectedPayment p4 = ReceiptParser.detectPayment("FT24287ABCD");
        assertEquals("CBE", p4.provider);
        assertEquals("FT24287ABCD", p4.reference);
        assertTrue(p4.isCbe);

        // 5. ?id=FT... URL
        ReceiptParser.DetectedPayment p5 = ReceiptParser.detectPayment("https://apps.cbe.com.et:100/?id=FT24287ABCD12345678");
        assertEquals("CBE", p5.provider);
        assertEquals("FT24287ABCD", p5.reference);
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
}
