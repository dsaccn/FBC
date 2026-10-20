package coffee.kogna.verifier;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.view.LayoutInflater;
import android.view.View;
import android.view.animation.Animation;
import android.view.animation.LinearInterpolator;
import android.view.animation.RotateAnimation;
import android.view.animation.TranslateAnimation;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.material.card.MaterialCardView;
import com.google.zxing.ResultPoint;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.ConnectionPool;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class MainActivity extends AppCompatActivity {

    private static final int CAMERA_PERMISSION_REQUEST_CODE = 2001;
    private static final String PREFS_NAME = "KognaVerifierPrefs";
    private static final String KEY_POS_URL = "pos_server_url";
    private static final String KEY_API_KEY = "pos_api_key";
    private static final String KEY_HISTORY = "scan_history_json";

    private static final String DEFAULT_POS_URL = "https://www.kogna.coffee";
    private static final String DEFAULT_API_KEY = "kogna_scanner_secure_2026";

    // UI Elements
    private DecoratedBarcodeView barcodeView;
    private View laserLine;
    private TextView txtPosStatus;
    private TextView txtPrompt;
    private TextView txtTodaySummary;
    private ImageButton btnFlash;
    private ImageButton btnRefresh;
    private ImageButton btnManual;
    private ImageButton btnSettings;
    private Button btnHistory;

    // Loading Overlay
    private View loadingOverlay;
    private TextView txtLoadingMsg;
    private Button btnCancelLoading;

    // Result Card
    private MaterialCardView cardResult;
    private ImageView imgResultIcon;
    private TextView txtResultStatus;
    private TextView txtResultProvider;
    private TextView txtResultBadge;
    private TextView txtResultAmount;
    private TextView txtResultPayer;
    private TextView txtResultReceiver;
    private TextView txtResultRef;
    private TextView txtResultDate;
    private TextView txtResultPosMatch;
    private ImageView btnCopyRef;
    private Button btnScanNext;
    private Button btnViewOfficial;

    // State Variables
    private boolean isFlashOn = false;
    private boolean isVerifying = false;
    private String lastVerifiedUrl = "";
    private Call currentActiveCall = null;

    private SharedPreferences prefs;
    private OkHttpClient httpClient;
    private ToneGenerator toneGenerator;
    private Vibrator vibrator;
    private Handler mainHandler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        mainHandler = new Handler(Looper.getMainLooper());

        setupHttpAndAudio();
        bindViews();
        setupListeners();
        setupScanner();
        startLaserAnimation();

        checkCameraPermission();
        testPosConnection(false);
        updateTodaySummary();
    }

    private void setupHttpAndAudio() {
        httpClient = new OkHttpClient.Builder()
                .connectionPool(new ConnectionPool(5, 5, TimeUnit.MINUTES))
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(12, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();

        try {
            toneGenerator = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 95);
        } catch (Exception ignored) {}

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
    }

    private void bindViews() {
        barcodeView = findViewById(R.id.barcodeView);
        laserLine = findViewById(R.id.laserLine);
        txtPosStatus = findViewById(R.id.txtPosStatus);
        txtPrompt = findViewById(R.id.txtPrompt);
        txtTodaySummary = findViewById(R.id.txtTodaySummary);
        btnFlash = findViewById(R.id.btnFlash);
        btnRefresh = findViewById(R.id.btnRefresh);
        btnManual = findViewById(R.id.btnManual);
        btnSettings = findViewById(R.id.btnSettings);
        btnHistory = findViewById(R.id.btnHistory);

        loadingOverlay = findViewById(R.id.loadingOverlay);
        txtLoadingMsg = findViewById(R.id.txtLoadingMsg);
        btnCancelLoading = findViewById(R.id.btnCancelLoading);

        cardResult = findViewById(R.id.cardResult);
        imgResultIcon = findViewById(R.id.imgResultIcon);
        txtResultStatus = findViewById(R.id.txtResultStatus);
        txtResultProvider = findViewById(R.id.txtResultProvider);
        txtResultBadge = findViewById(R.id.txtResultBadge);
        txtResultAmount = findViewById(R.id.txtResultAmount);
        txtResultPayer = findViewById(R.id.txtResultPayer);
        txtResultReceiver = findViewById(R.id.txtResultReceiver);
        txtResultRef = findViewById(R.id.txtResultRef);
        txtResultDate = findViewById(R.id.txtResultDate);
        txtResultPosMatch = findViewById(R.id.txtResultPosMatch);
        btnCopyRef = findViewById(R.id.btnCopyRef);
        btnScanNext = findViewById(R.id.btnScanNext);
        btnViewOfficial = findViewById(R.id.btnViewOfficial);
    }

    private void setupListeners() {
        btnFlash.setOnClickListener(v -> toggleFlashlight());
        btnRefresh.setOnClickListener(v -> handleRefresh());
        btnManual.setOnClickListener(v -> showManualInputDialog());
        btnSettings.setOnClickListener(v -> showSettingsDialog());
        btnHistory.setOnClickListener(v -> showHistoryDialog());

        btnScanNext.setOnClickListener(v -> resetScannerToActive());

        btnViewOfficial.setOnClickListener(v -> {
            if (lastVerifiedUrl != null && !lastVerifiedUrl.isEmpty()) {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(lastVerifiedUrl));
                startActivity(browserIntent);
            }
        });

        btnCopyRef.setOnClickListener(v -> {
            String ref = txtResultRef.getText().toString();
            if (!ref.isEmpty() && !"-".equals(ref)) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("Transaction Reference", ref);
                clipboard.setPrimaryClip(clip);
                Toast.makeText(this, "Reference copied to clipboard", Toast.LENGTH_SHORT).show();
            }
        });

        btnCancelLoading.setOnClickListener(v -> {
            if (currentActiveCall != null) {
                currentActiveCall.cancel();
            }
            hideLoading();
            resetScannerToActive();
        });
    }

    private void setupScanner() {
        barcodeView.setStatusText(""); // Hide default camera status label
        barcodeView.decodeContinuous(new BarcodeCallback() {
            @Override
            public void barcodeResult(BarcodeResult result) {
                if (result != null && result.getText() != null && !result.getText().trim().isEmpty()) {
                    if (!isVerifying && cardResult.getVisibility() != View.VISIBLE) {
                        handleScannedPayload(result.getText().trim());
                    }
                }
            }

            @Override
            public void possibleResultPoints(List<ResultPoint> resultPoints) {}
        });
    }

    private void startLaserAnimation() {
        TranslateAnimation animation = new TranslateAnimation(
                Animation.RELATIVE_TO_PARENT, 0.0f,
                Animation.RELATIVE_TO_PARENT, 0.0f,
                Animation.RELATIVE_TO_PARENT, 0.0f,
                Animation.RELATIVE_TO_PARENT, 1.0f);
        animation.setDuration(1800);
        animation.setRepeatCount(Animation.INFINITE);
        animation.setRepeatMode(Animation.REVERSE);
        animation.setInterpolator(new LinearInterpolator());
        laserLine.startAnimation(animation);
    }

    private void toggleFlashlight() {
        isFlashOn = !isFlashOn;
        if (isFlashOn) {
            barcodeView.setTorchOn();
            btnFlash.setImageResource(R.drawable.ic_flash_on);
        } else {
            barcodeView.setTorchOff();
            btnFlash.setImageResource(R.drawable.ic_flash_off);
        }
    }

    private void handleRefresh() {
        RotateAnimation rotate = new RotateAnimation(
                0, 360,
                Animation.RELATIVE_TO_SELF, 0.5f,
                Animation.RELATIVE_TO_SELF, 0.5f);
        rotate.setDuration(600);
        rotate.setInterpolator(new LinearInterpolator());
        btnRefresh.startAnimation(rotate);

        testPosConnection(true);
        resetScannerToActive();
    }

    private void checkCameraPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.CAMERA},
                    CAMERA_PERMISSION_REQUEST_CODE
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST_CODE) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                barcodeView.resume();
            } else {
                Toast.makeText(this, R.string.camera_permission_required, Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        barcodeView.resume();
        testPosConnection(false);
    }

    @Override
    protected void onPause() {
        super.onPause();
        barcodeView.pause();
        if (isFlashOn) toggleFlashlight();
    }

    @Override
    protected void onDestroy() {
        if (toneGenerator != null) {
            toneGenerator.release();
        }
        super.onDestroy();
    }

    // ==========================================
    // ⚡ SCAN & VERIFICATION LOGIC
    // ==========================================

    private void handleScannedPayload(final String payload) {
        isVerifying = true;
        barcodeView.pause();
        playBeep(true);

        showLoading("Verifying official slip on device network...");

        new Thread(() -> {
            String cleaned = payload.trim();

            // Detect provider
            boolean isCbe = cleaned.toUpperCase().startsWith("FT") ||
                    cleaned.toLowerCase().contains("cbe.com.et") ||
                    cleaned.startsWith("v2-") ||
                    cleaned.toLowerCase().contains("mbreciept");

            if (isCbe) {
                verifyCbeSlip(cleaned);
            } else {
                verifyTelebirrSlip(cleaned);
            }
        }).start();
    }

    /**
     * Direct On-Device Verification for Telebirr Slip
     */
    private void verifyTelebirrSlip(final String rawInput) {
        final String transactionId = extractTelebirrId(rawInput);
        if (transactionId == null || transactionId.isEmpty()) {
            mainHandler.post(() -> showVerificationResult(
                    false, "TELEBIRR", rawInput, 0.0, "-", "-",
                    "Invalid QR format", "Unable to extract Telebirr reference code", ""
            ));
            return;
        }

        final String slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + transactionId;
        lastVerifiedUrl = slipUrl;

        Request request = new Request.Builder()
                .url(slipUrl)
                .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")
                .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                .header("Accept-Language", "en-US,en;q=0.9,am;q=0.8")
                .header("Connection", "Keep-Alive")
                .build();

        currentActiveCall = httpClient.newCall(request);
        currentActiveCall.enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                mainHandler.post(() -> showVerificationResult(
                        false, "TELEBIRR", transactionId, 0.0, "-", "-",
                        "Network Timeout", "Direct connection to Ethio Telecom timed out. Please retry.", slipUrl
                ));
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (!response.isSuccessful()) {
                    mainHandler.post(() -> showVerificationResult(
                            false, "TELEBIRR", transactionId, 0.0, "-", "-",
                            "Receipt Not Found", "Ethio Telecom returned HTTP " + response.code(), slipUrl
                    ));
                    return;
                }

                String html = response.body() != null ? response.body().string() : "";
                parseAndDisplayTelebirrHtml(html, transactionId, slipUrl);
            }
        });
    }

    private void parseAndDisplayTelebirrHtml(final String html, final String transactionId, final String slipUrl) {
        if (html.contains("This request is not correct") || html.contains("not found") || html.length() < 300) {
            mainHandler.post(() -> showVerificationResult(
                    false, "TELEBIRR", transactionId, 0.0, "-", "-",
                    "Invalid Slip", "Expired or non-existent Telebirr receipt", slipUrl
            ));
            return;
        }

        String payerName = extractHtmlField(html, "Payer\\s*Name");
        String payerPhone = extractHtmlField(html, "Payer\\s*telebirr");
        String receiverName = extractHtmlField(html, "Credited\\s*Party\\s*name");
        String receiverPhone = extractHtmlField(html, "Credited\\s*party\\s*account\\s*no");
        if (receiverPhone == null) receiverPhone = extractHtmlField(html, "Receiver\\s*telebirr");

        // Extract Amount
        double amount = 0.0;
        Matcher settledMatch = Pattern.compile("(?:Settled\\s*Amount|የተከፈለው\\s*መጠን)[\\s\\S]*?([\\d,.]+)\\s*Birr", Pattern.CASE_INSENSITIVE).matcher(html);
        if (settledMatch.find()) {
            amount = parseDoubleSafe(settledMatch.group(1));
        } else {
            Matcher totalMatch = Pattern.compile("(?:Total\\s*Paid\\s*Amount|ጠቅላላ\\s*የተከፈለ)[\\s\\S]*?([\\d,.]+)\\s*Birr", Pattern.CASE_INSENSITIVE).matcher(html);
            if (totalMatch.find()) {
                amount = parseDoubleSafe(totalMatch.group(1));
            }
        }

        // Extract Date
        String dateTime = "-";
        Matcher dateMatch = Pattern.compile("(\\d{2}-\\d{2}-\\d{4}\\s+\\d{2}:\\d{2}:\\d{2})").matcher(html);
        if (dateMatch.find()) {
            dateTime = dateMatch.group(1);
        }

        final double finalAmount = amount;
        final String finalPayer = (payerName != null && !payerName.isEmpty()) ? payerName : (payerPhone != null ? payerPhone : "Customer");
        final String finalReceiver = (receiverName != null && !receiverName.isEmpty()) ? receiverName : (receiverPhone != null ? receiverPhone : "Kogna Coffee");
        final String finalDate = dateTime;

        mainHandler.post(() -> {
            showVerificationResult(
                    true, "TELEBIRR", transactionId, finalAmount, finalPayer, finalReceiver,
                    finalDate, null, slipUrl
            );

            // Sync with local POS machine in background
            syncVerificationWithPos(transactionId, "TELEBIRR", finalAmount, finalPayer, finalReceiver, html);
        });
    }

    /**
     * Direct On-Device Verification for CBE Slip
     */
    private void verifyCbeSlip(final String rawInput) {
        String clean = rawInput.trim();
        String tokenId = clean.replaceAll("^https?://(?:mbrecie?pt|mb)\\.cbe\\.com\\.et/", "");
        final String cbeUrl = "https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/" + tokenId;
        lastVerifiedUrl = "https://mbreciept.cbe.com.et/" + tokenId;

        Request request = new Request.Builder()
                .url(cbeUrl)
                .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                .header("X-App-ID", "d1292e42-7400-49de-a2d3-9731caa4c819")
                .header("X-App-Version", "0a01980b-9859-1369-8198-59f403820000")
                .header("Accept", "application/json")
                .build();

        currentActiveCall = httpClient.newCall(request);
        currentActiveCall.enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                mainHandler.post(() -> showVerificationResult(
                        false, "CBE", tokenId, 0.0, "-", "-",
                        "CBE Gateway Delay", "Direct CBE network request timed out.", lastVerifiedUrl
                ));
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (!response.isSuccessful()) {
                    mainHandler.post(() -> showVerificationResult(
                            false, "CBE", tokenId, 0.0, "-", "-",
                            "CBE Invalid", "CBE returned HTTP " + response.code(), lastVerifiedUrl
                    ));
                    return;
                }

                try {
                    String jsonStr = response.body() != null ? response.body().string() : "{}";
                    JSONObject json = new JSONObject(jsonStr);

                    String status = json.optString("status", "");
                    boolean isSuccess = status.equalsIgnoreCase("COMPLETED") || status.equalsIgnoreCase("SUCCESS");

                    double amount = parseDoubleSafe(json.optString("amountCredited", json.optString("debitAmount", "0")));
                    String payer = json.optString("debitAccountHolder", "CBE Customer");
                    String receiver = json.optString("creditAccountHolder", "Kogna Coffee");
                    String ref = json.optString("id", tokenId);

                    String dateTime = "-";
                    JSONArray dates = json.optJSONArray("dateTimes");
                    if (dates != null && dates.length() > 0) {
                        dateTime = dates.getString(0);
                    }

                    final double finalAmount = amount;
                    final String finalPayer = payer;
                    final String finalReceiver = receiver;
                    final String finalRef = ref;
                    final String finalDate = dateTime;
                    final boolean finalSuccess = isSuccess;

                    mainHandler.post(() -> {
                        showVerificationResult(
                                finalSuccess, "CBE", finalRef, finalAmount, finalPayer, finalReceiver,
                                finalDate, null, lastVerifiedUrl
                        );

                        if (finalSuccess) {
                            syncVerificationWithPos(finalRef, "CBE", finalAmount, finalPayer, finalReceiver, null);
                        }
                    });
                } catch (Exception ex) {
                    mainHandler.post(() -> showVerificationResult(
                            false, "CBE", tokenId, 0.0, "-", "-",
                            "Parse Error", "Unable to read CBE slip details", lastVerifiedUrl
                    ));
                }
            }
        });
    }

    /**
     * Display Verification Result Card
     */
    private void showVerificationResult(
            boolean isSuccess,
            String provider,
            String reference,
            double amount,
            String payer,
            String receiver,
            String dateTime,
            String errorMessage,
            String slipUrl
    ) {
        hideLoading();
        isVerifying = false;

        cardResult.setVisibility(View.VISIBLE);

        if (isSuccess) {
            playBeep(true);
            vibrateSuccess();

            imgResultIcon.setImageResource(R.drawable.ic_verified_check);
            txtResultStatus.setText(R.string.verified_title);
            txtResultStatus.setTextColor(ContextCompat.getColor(this, R.color.status_green));

            txtResultBadge.setText("GENUINE");
            txtResultBadge.setBackgroundResource(R.drawable.badge_status_green);
            txtResultBadge.setTextColor(ContextCompat.getColor(this, R.color.status_green));

            txtResultAmount.setText(String.format(Locale.US, "%.2f ETB", amount));
            txtResultPayer.setText(payer);
            txtResultReceiver.setText(receiver);
            txtResultRef.setText(reference);
            txtResultDate.setText(dateTime);
            txtResultPosMatch.setText("⚡ Checking open POS orders...");

            // Save to local scan history
            saveToHistory(reference, provider, amount, payer, dateTime, true);
        } else {
            playBeep(false);
            vibrateError();

            imgResultIcon.setImageResource(R.drawable.ic_error_cross);
            txtResultStatus.setText(errorMessage != null ? errorMessage : getString(R.string.failed_title));
            txtResultStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red));

            txtResultBadge.setText("FAILED");
            txtResultBadge.setBackgroundResource(R.drawable.badge_status_red);
            txtResultBadge.setTextColor(ContextCompat.getColor(this, R.color.status_red));

            txtResultAmount.setText("0.00 ETB");
            txtResultPayer.setText(payer);
            txtResultReceiver.setText(receiver);
            txtResultRef.setText(reference);
            txtResultDate.setText(dateTime != null ? dateTime : "-");
            txtResultPosMatch.setText("❌ " + (errorMessage != null ? errorMessage : "Payment not confirmed"));
        }

        txtResultProvider.setText(provider);
        lastVerifiedUrl = slipUrl;

        updateTodaySummary();
    }

    /**
     * Asynchronously sync verified receipt with local/cloud POS server
     */
    private void syncVerificationWithPos(
            final String reference,
            final String provider,
            final double amount,
            final String payer,
            final String receiver,
            final String htmlContent
    ) {
        String posUrl = prefs.getString(KEY_POS_URL, DEFAULT_POS_URL);
        if (posUrl == null || posUrl.trim().isEmpty()) {
            posUrl = DEFAULT_POS_URL;
        }

        try {
            JSONObject body = new JSONObject();
            body.put("referenceOrUrl", reference);
            body.put("provider", provider);
            body.put("expectedAmount", amount);
            if (htmlContent != null) {
                body.put("htmlContent", htmlContent);
            }

            RequestBody requestBody = RequestBody.Companion.create(
                    body.toString(),
                    MediaType.Companion.parse("application/json; charset=utf-8")
            );

            Request request = new Request.Builder()
                    .url(posUrl.replaceAll("/+$", "") + "/api/verify-receipt")
                    .post(requestBody)
                    .build();

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    mainHandler.post(() -> txtResultPosMatch.setText("📱 Standalone Verified (POS Offline)"));
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    if (response.isSuccessful()) {
                        try {
                            String respStr = response.body() != null ? response.body().string() : "{}";
                            JSONObject respJson = new JSONObject(respStr);
                            JSONObject linkedOrder = respJson.optJSONObject("linkedOrder");

                            if (linkedOrder != null) {
                                String tableNo = linkedOrder.optString("tableNumber", "?");
                                mainHandler.post(() -> txtResultPosMatch.setText("✅ Matched Table #" + tableNo + " (Order Paid)"));
                            } else {
                                mainHandler.post(() -> txtResultPosMatch.setText("⚡ Sent to Cashier POS (Ready to link)"));
                            }
                        } catch (Exception ex) {
                            mainHandler.post(() -> txtResultPosMatch.setText("✅ Synced with POS"));
                        }
                    } else {
                        mainHandler.post(() -> txtResultPosMatch.setText("📱 Standalone Verified"));
                    }
                }
            });
        } catch (Exception ignored) {
            txtResultPosMatch.setText("📱 Standalone Verified");
        }
    }

    private void resetScannerToActive() {
        cardResult.setVisibility(View.GONE);
        hideLoading();
        isVerifying = false;
        barcodeView.resume();
    }

    private void showLoading(String message) {
        txtLoadingMsg.setText(message);
        loadingOverlay.setVisibility(View.VISIBLE);
    }

    private void hideLoading() {
        loadingOverlay.setVisibility(View.GONE);
    }

    // ==========================================
    // ⚙️ DIALOGS (MANUAL, SETTINGS, HISTORY)
    // ==========================================

    private void showManualInputDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_manual_input, null);
        builder.setView(dialogView);

        AlertDialog dialog = builder.create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        EditText inputCode = dialogView.findViewById(R.id.inputCode);
        RadioGroup radioProvider = dialogView.findViewById(R.id.radioProvider);
        Button btnVerify = dialogView.findViewById(R.id.btnVerifyManual);
        Button btnCancel = dialogView.findViewById(R.id.btnCancelManual);

        btnVerify.setOnClickListener(v -> {
            String code = inputCode.getText().toString().trim();
            if (code.isEmpty()) {
                inputCode.setError("Enter transaction reference code");
                return;
            }
            dialog.dismiss();
            handleScannedPayload(code);
        });

        btnCancel.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    private void showSettingsDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_settings, null);
        builder.setView(dialogView);

        AlertDialog dialog = builder.create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        EditText inputPosUrl = dialogView.findViewById(R.id.inputPosUrl);
        EditText inputApiKey = dialogView.findViewById(R.id.inputApiKey);
        Button btnSave = dialogView.findViewById(R.id.btnSaveSettings);
        Button btnTest = dialogView.findViewById(R.id.btnTestSettings);
        Button btnClose = dialogView.findViewById(R.id.btnCloseSettings);

        inputPosUrl.setText(prefs.getString(KEY_POS_URL, DEFAULT_POS_URL));
        inputApiKey.setText(prefs.getString(KEY_API_KEY, DEFAULT_API_KEY));

        btnTest.setOnClickListener(v -> {
            String testUrl = inputPosUrl.getText().toString().trim();
            btnTest.setText("Testing...");
            Request req = new Request.Builder().url(testUrl.replaceAll("/+$", "") + "/api/health").build();
            httpClient.newCall(req).enqueue(new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    mainHandler.post(() -> {
                        btnTest.setText("Test Failed");
                        Toast.makeText(MainActivity.this, "Cannot connect: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    });
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) {
                    mainHandler.post(() -> {
                        btnTest.setText("Success (OK)");
                        Toast.makeText(MainActivity.this, "Connected successfully!", Toast.LENGTH_SHORT).show();
                    });
                }
            });
        });

        btnSave.setOnClickListener(v -> {
            prefs.edit()
                    .putString(KEY_POS_URL, inputPosUrl.getText().toString().trim())
                    .putString(KEY_API_KEY, inputApiKey.getText().toString().trim())
                    .apply();
            dialog.dismiss();
            testPosConnection(true);
            Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show();
        });

        btnClose.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    private void showHistoryDialog() {
        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        View dialogView = LayoutInflater.from(this).inflate(R.layout.dialog_history, null);
        builder.setView(dialogView);

        AlertDialog dialog = builder.create();
        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(android.R.color.transparent);
        }

        LinearLayout listContainer = dialogView.findViewById(R.id.historyListContainer);
        TextView txtHistoryTotal = dialogView.findViewById(R.id.txtHistoryTotal);
        Button btnClear = dialogView.findViewById(R.id.btnClearHistory);
        Button btnClose = dialogView.findViewById(R.id.btnCloseHistory);

        String historyJson = prefs.getString(KEY_HISTORY, "[]");
        try {
            JSONArray arr = new JSONArray(historyJson);
            double totalBirr = 0.0;
            listContainer.removeAllViews();

            for (int i = arr.length() - 1; i >= 0; i--) {
                JSONObject item = arr.getJSONObject(i);
                double amt = item.optDouble("amount", 0.0);
                totalBirr += amt;

                TextView row = new TextView(this);
                row.setPadding(0, 16, 0, 16);
                row.setTextColor(ContextCompat.getColor(this, R.color.text_primary));
                row.setText(String.format(Locale.US,
                        "• %s | %.2f ETB | %s\n  Ref: %s | Payer: %s",
                        item.optString("provider"), amt, item.optString("time"),
                        item.optString("reference"), item.optString("payer")
                ));
                listContainer.addView(row);
            }

            txtHistoryTotal.setText(String.format(Locale.US, "Today's Total: %.2f ETB (%d scans)", totalBirr, arr.length()));
        } catch (Exception ignored) {}

        btnClear.setOnClickListener(v -> {
            prefs.edit().putString(KEY_HISTORY, "[]").apply();
            dialog.dismiss();
            updateTodaySummary();
            Toast.makeText(this, "History cleared", Toast.LENGTH_SHORT).show();
        });

        btnClose.setOnClickListener(v -> dialog.dismiss());
        dialog.show();
    }

    private void saveToHistory(String ref, String provider, double amount, String payer, String time, boolean success) {
        try {
            String historyJson = prefs.getString(KEY_HISTORY, "[]");
            JSONArray arr = new JSONArray(historyJson);

            JSONObject item = new JSONObject();
            item.put("reference", ref);
            item.put("provider", provider);
            item.put("amount", amount);
            item.put("payer", payer);
            item.put("time", new SimpleDateFormat("HH:mm", Locale.US).format(new Date()));
            item.put("success", success);

            arr.put(item);
            prefs.edit().putString(KEY_HISTORY, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    private void updateTodaySummary() {
        try {
            String historyJson = prefs.getString(KEY_HISTORY, "[]");
            JSONArray arr = new JSONArray(historyJson);
            double total = 0.0;
            for (int i = 0; i < arr.length(); i++) {
                total += arr.getJSONObject(i).optDouble("amount", 0.0);
            }
            txtTodaySummary.setText(String.format(Locale.US, "Today: %d receipts • %.2f ETB", arr.length(), total));
        } catch (Exception ignored) {}
    }

    private void testPosConnection(boolean showToast) {
        String posUrl = prefs.getString(KEY_POS_URL, DEFAULT_POS_URL);
        Request request = new Request.Builder()
                .url(posUrl.replaceAll("/+$", "") + "/api/health")
                .build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                mainHandler.post(() -> {
                    txtPosStatus.setText("● Standalone");
                    txtPosStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.gold));
                    if (showToast) {
                        Toast.makeText(MainActivity.this, "Operating Standalone (Offline Mode)", Toast.LENGTH_SHORT).show();
                    }
                });
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) {
                mainHandler.post(() -> {
                    if (response.isSuccessful()) {
                        txtPosStatus.setText("● POS Online");
                        txtPosStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_green));
                        if (showToast) {
                            Toast.makeText(MainActivity.this, "POS Synchronized", Toast.LENGTH_SHORT).show();
                        }
                    } else {
                        txtPosStatus.setText("● Standalone");
                    }
                });
            }
        });
    }

    // ==========================================
    // 🛠️ HELPERS & REGEX
    // ==========================================

    private String extractTelebirrId(String raw) {
        if (raw == null) return null;
        String clean = raw.trim();

        // 1. URL pattern
        Matcher urlMatcher = Pattern.compile("/receipt/([A-Za-z0-9_-]+)", Pattern.CASE_INSENSITIVE).matcher(clean);
        if (urlMatcher.find()) return urlMatcher.group(1).toUpperCase();

        // 2. Base64 EMVCo SuperApp QR code
        try {
            byte[] decoded = Base64.decode(clean.replaceAll("\\s+", ""), Base64.DEFAULT);
            String text = new String(decoded, StandardCharsets.UTF_8);
            Matcher emvMatcher = Pattern.compile("000A([0-9a-fA-F]{20})", Pattern.CASE_INSENSITIVE).matcher(text);
            if (emvMatcher.find()) {
                String hex = emvMatcher.group(1);
                StringBuilder ascii = new StringBuilder();
                for (int i = 0; i < hex.length() - 1; i += 2) {
                    ascii.append((char) Integer.parseInt(hex.substring(i, i + 2), 16));
                }
                return ascii.toString().toUpperCase();
            }
        } catch (Exception ignored) {}

        // 3. Standalone 10-char reference code (e.g. DJJ7261SX7)
        String[] tokens = clean.split("[\\s,.;:()!?-]+");
        for (String tok : tokens) {
            String c = tok.replaceAll("[^A-Za-z0-9]", "");
            if (c.length() == 10 && c.matches("^[A-Za-z0-9]{10}$")) {
                return c.toUpperCase();
            }
        }

        return clean.replaceAll("[^A-Za-z0-9_-]", "").toUpperCase();
    }

    private String extractHtmlField(String html, String fieldRegex) {
        try {
            Pattern p = Pattern.compile(fieldRegex + "[^<]*</t[dh]>\\s*<td[^>]*>([\\s\\S]*?)</td>", Pattern.CASE_INSENSITIVE);
            Matcher m = p.matcher(html);
            if (m.find()) {
                return m.group(1).replaceAll("<[^>]+>", "").trim();
            }
        } catch (Exception ignored) {}
        return null;
    }

    private double parseDoubleSafe(String val) {
        if (val == null) return 0.0;
        try {
            Matcher m = Pattern.compile("[\\d.]+").matcher(val.replaceAll(",", ""));
            if (m.find()) {
                return Double.parseDouble(m.group(0));
            }
        } catch (Exception ignored) {}
        return 0.0;
    }

    private void playBeep(boolean success) {
        try {
            if (toneGenerator != null) {
                toneGenerator.startTone(success ? ToneGenerator.TONE_PROP_BEEP : ToneGenerator.TONE_PROP_NACK, 160);
            }
        } catch (Exception ignored) {}
    }

    private void vibrateSuccess() {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 80, 50, 80}, -1));
            } else {
                vibrator.vibrate(150);
            }
        }
    }

    private void vibrateError() {
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(350, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(350);
            }
        }
    }
}
