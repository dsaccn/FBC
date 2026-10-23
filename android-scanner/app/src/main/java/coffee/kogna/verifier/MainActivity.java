package coffee.kogna.verifier;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.content.pm.PackageManager;
import android.util.TypedValue;
import android.media.AudioManager;
import android.media.ToneGenerator;
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
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.graphics.Bitmap;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.os.LocaleListCompat;
import android.content.res.Configuration;
import android.content.res.Resources;

import com.google.android.material.card.MaterialCardView;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.DecodeHintType;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.Result;
import com.google.zxing.ResultPoint;
import com.journeyapps.barcodescanner.BarcodeCallback;
import com.journeyapps.barcodescanner.BarcodeResult;
import com.journeyapps.barcodescanner.Decoder;
import com.journeyapps.barcodescanner.DecoderFactory;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;
import com.journeyapps.barcodescanner.DefaultDecoderFactory;
import com.journeyapps.barcodescanner.camera.CameraSettings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.ConnectionPool;
import okhttp3.ConnectionSpec;
import okhttp3.Dns;
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
    public static final String KEY_APP_LANGUAGE = "app_language";

    // Receiver Account Caching
    private static final String KEY_TELEBIRR_RECV = "cached_telebirr_recv";
    private static final String KEY_CBE_RECV = "cached_cbe_recv";
    private static final String KEY_MERCHANT_NAME = "cached_merchant_name";

    // Cashier PC Default Endpoints (Cloudflare Tunnel & Local Café Wi-Fi IP)
    private static final String DEFAULT_TUNNEL_URL = "https://scanner.kogna.coffee";
    private static final String DEFAULT_LOCAL_URL = "http://192.168.1.5:3000";
    private static final String DEFAULT_API_KEY = "kogna_scanner_secure_2026";

    // UI Elements
    private WebView webView;
    private DecoratedBarcodeView barcodeView;
    private View laserLine;
    private TextView txtPosStatus;
    private TextView txtPrompt;
    private TextView txtTodaySummary;
    private ImageButton btnLanguage;
    private ImageButton btnToggleEngine;
    private ImageButton btnFlash;
    private ImageButton btnRefresh;
    private ImageButton btnManual;
    private ImageButton btnSettings;
    private Button btnHistory;

    // Open Orders Section
    private TextView txtOpenOrdersHeader;
    private LinearLayout bannerSelectedOrder;
    private TextView txtSelectedOrderTitle;
    private Button btnDeselectOrder;
    private LinearLayout layoutOrdersList;
    private TextView txtNoOrdersNotice;

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
    private LinearLayout layoutPostScanTablePicker;
    private LinearLayout layoutPostScanTableButtons;
    private ImageView btnCopyRef;
    private Button btnScanNext;
    private Button btnRetryVerification;
    private Button btnViewOfficial;

    // State Variables
    private String lastRawScan = "";
    private boolean isLinkingInFlight = false;
    private boolean isWebViewMode = false;
    private boolean isFlashOn = false;
    private boolean isVerifying = false;
    private String lastVerifiedUrl = "";
    private Call currentActiveCall = null;
    private final List<Call> activeVerificationCalls = Collections.synchronizedList(new ArrayList<>());
    private String activePosUrl = DEFAULT_LOCAL_URL;

    // Last scanned verified data for post-scan table linking
    private String lastVerifiedRef = "";
    private String lastVerifiedProvider = "";
    private double lastVerifiedAmount = 0.0;
    private String lastVerifiedPayer = "";
    private String lastVerifiedReceiver = "";
    private boolean isCurrentResultDuplicate = false;

    // Cached Receiver Settings for instant check & offline fallback
    private String cachedTelebirrReceiver = "";
    private String cachedCbeReceiver = "";
    private String cachedMerchantName = "Kogna Coffee";

    // Open Orders Data
    public static class OpenOrder {
        public String id;
        public String tableId;
        public String displayTitle;
        public double total;
        public int itemsCount;
        public boolean isVerified;
        public boolean isDelivery;
        public boolean isTakeaway;
    }

    private final List<OpenOrder> currentOpenOrders = new ArrayList<>();
    private OpenOrder selectedOrder = null;

    // Orders-First Hub state
    private LinearLayout ordersSection;
    private View scannerOverlay;
    private View fabOpenScanner;
    private Button btnCloseScanner;
    private TextView chipAll;
    private TextView chipTables;
    private TextView chipDelivery;
    private boolean isScannerOpen = false;
    private String activeFilter = "ALL";

    private SharedPreferences prefs;
    private OkHttpClient httpClient;
    private OkHttpClient telebirrHttpClient;
    private ToneGenerator toneGenerator;
    private Vibrator vibrator;
    private Handler mainHandler;
    private Runnable hedgedFallbackRunnable;

    // 🧠 Google ML Kit Live Text Recognition (Dual Auto-Detection: QR + SMS/USSD OCR)
    private TextRecognizer textRecognizer;
    private final AtomicBoolean isOcrProcessing = new AtomicBoolean(false);
    private long lastOcrTimestamp = 0L;
    private long lastOcrTriggerTime = 0L;
    private String lastDetectedOcrRef = "";

    // Polling runnable for real-time open orders from Cashier PC
    private final Runnable orderPollRunnable = new Runnable() {
        @Override
        public void run() {
            fetchOpenOrders(false);
            mainHandler.postDelayed(this, 3500);
        }
    };

    @Override
    protected void attachBaseContext(Context newBase) {
        SharedPreferences sp = newBase.getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String lang = sp.getString(KEY_APP_LANGUAGE, "en");
        Locale locale = new Locale(lang);
        Locale.setDefault(locale);
        Configuration config = new Configuration(newBase.getResources().getConfiguration());
        config.setLocale(locale);
        Context context = newBase.createConfigurationContext(config);
        super.attachBaseContext(context);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        mainHandler = new Handler(Looper.getMainLooper());

        cachedTelebirrReceiver = prefs.getString(KEY_TELEBIRR_RECV, "");
        cachedCbeReceiver = prefs.getString(KEY_CBE_RECV, "");
        cachedMerchantName = prefs.getString(KEY_MERCHANT_NAME, "Kogna Coffee");

        setupHttpAndAudio();
        bindViews();
        setupWebView();
        setupListeners();
        setupScanner();

        // Camera starts paused & hidden — orders grid is the default state
        barcodeView.setVisibility(View.GONE);
        barcodeView.pause();

        checkCameraPermission();
        discoverAndConnectCashierPc(false);
        updateTodaySummary();
    }

    private void setupHttpAndAudio() {
        List<ConnectionSpec> specs = Arrays.asList(
                ConnectionSpec.MODERN_TLS,
                ConnectionSpec.COMPATIBLE_TLS,
                ConnectionSpec.CLEARTEXT
        );
        Dns fastDns = hostname -> {
            try {
                return Dns.SYSTEM.lookup(hostname);
            } catch (UnknownHostException e) {
                if ("transactioninfo.ethiotelecom.et".equalsIgnoreCase(hostname)) {
                    try {
                        return Collections.singletonList(
                                InetAddress.getByAddress("transactioninfo.ethiotelecom.et", new byte[]{(byte) 196, (byte) 188, 116, 120})
                        );
                    } catch (UnknownHostException ignored) {}
                }
                throw e;
            }
        };

        httpClient = new OkHttpClient.Builder()
                .dns(fastDns)
                .connectionSpecs(specs)
                .connectionPool(new ConnectionPool(5, 5, TimeUnit.MINUTES))
                .connectTimeout(12, TimeUnit.SECONDS)
                .readTimeout(20, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .retryOnConnectionFailure(true)
                .build();

        telebirrHttpClient = httpClient.newBuilder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(8, TimeUnit.SECONDS)
                .build();

        try {
            toneGenerator = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 95);
        } catch (Exception ignored) {}

        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);

        try {
            textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        } catch (Exception ignored) {}
    }

    private void bindViews() {
        webView = findViewById(R.id.webView);
        barcodeView = findViewById(R.id.barcodeView);
        laserLine = findViewById(R.id.laserLine);
        txtPosStatus = findViewById(R.id.txtPosStatus);
        txtPrompt = findViewById(R.id.txtPrompt);
        txtTodaySummary = findViewById(R.id.txtTodaySummary);
        btnLanguage = findViewById(R.id.btnLanguage);
        btnToggleEngine = btnLanguage;
        btnFlash = findViewById(R.id.btnFlash);
        btnRefresh = findViewById(R.id.btnRefresh);
        btnManual = findViewById(R.id.btnManual);
        btnSettings = findViewById(R.id.btnSettings);
        btnHistory = findViewById(R.id.btnHistory);

        txtOpenOrdersHeader = findViewById(R.id.txtOpenOrdersHeader);
        bannerSelectedOrder = findViewById(R.id.bannerSelectedOrder);
        txtSelectedOrderTitle = findViewById(R.id.txtSelectedOrderTitle);
        btnDeselectOrder = findViewById(R.id.btnDeselectOrder);
        layoutOrdersList = findViewById(R.id.layoutOrdersList);
        txtNoOrdersNotice = findViewById(R.id.txtNoOrdersNotice);

        ordersSection = findViewById(R.id.ordersSection);
        scannerOverlay = findViewById(R.id.scannerOverlay);
        fabOpenScanner = findViewById(R.id.fabOpenScanner);
        btnCloseScanner = findViewById(R.id.btnCloseScanner);
        chipAll = findViewById(R.id.chipAll);
        chipTables = findViewById(R.id.chipTables);
        chipDelivery = findViewById(R.id.chipDelivery);

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
        layoutPostScanTablePicker = findViewById(R.id.layoutPostScanTablePicker);
        layoutPostScanTableButtons = findViewById(R.id.layoutPostScanTableButtons);
        btnCopyRef = findViewById(R.id.btnCopyRef);
        btnScanNext = findViewById(R.id.btnScanNext);
        btnRetryVerification = findViewById(R.id.btnRetryVerification);
        btnViewOfficial = findViewById(R.id.btnViewOfficial);

        TextView txtAppVersion = findViewById(R.id.txtAppVersion);
        if (txtAppVersion != null) {
            try {
                android.content.pm.PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                txtAppVersion.setText("v" + pInfo.versionName);
            } catch (Exception ignored) {
                txtAppVersion.setText("v2.5.5");
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        if (webView == null) return;
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Grant camera access to embedded scanner link seamlessly
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }
        });

        // Add AndroidBridge for zero-delay slip fetching inside the webview engine
        webView.addJavascriptInterface(new AndroidWebBridge(), "AndroidBridge");
    }

    public class AndroidWebBridge {
        @JavascriptInterface
        public void fetchReceipt(final String url, final String callbackId) {
            Request request = new Request.Builder()
                    .url(url)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36")
                    .build();

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    mainHandler.post(() -> {
                        if (webView != null) {
                            webView.evaluateJavascript("if(typeof window['" + callbackId + "']==='function'){window['" + callbackId + "'](false,'');}", null);
                        }
                    });
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    final String body = response.body() != null ? response.body().string() : "";
                    mainHandler.post(() -> {
                        if (webView != null) {
                            String escaped = body.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
                            webView.evaluateJavascript("if(typeof window['" + callbackId + "']==='function'){window['" + callbackId + "'](true,\"" + escaped + "\");}", null);
                        }
                    });
                }
            });
        }

        @JavascriptInterface
        public void playChime(boolean success) {
            playBeep(success);
        }

        @JavascriptInterface
        public void triggerHaptic(boolean success) {
            if (success) vibrateSuccess();
            else vibrateError();
        }
    }

    private void setupListeners() {
        if (btnLanguage != null) {
            btnLanguage.setOnClickListener(v -> showLanguageDialog());
        }
        btnFlash.setOnClickListener(v -> toggleFlashlight());
        btnRefresh.setOnClickListener(v -> handleRefresh());
        btnManual.setOnClickListener(v -> showManualInputDialog());
        btnSettings.setOnClickListener(v -> showSettingsDialog());
        btnHistory.setOnClickListener(v -> showHistoryDialog());

        btnDeselectOrder.setOnClickListener(v -> clearSelectedOrder());

        if (fabOpenScanner != null) fabOpenScanner.setOnClickListener(v -> openScannerOverlay());
        if (btnCloseScanner != null) btnCloseScanner.setOnClickListener(v -> closeScannerOverlay());
        if (chipAll != null) chipAll.setOnClickListener(v -> setActiveFilter("ALL"));
        if (chipTables != null) chipTables.setOnClickListener(v -> setActiveFilter("TABLE"));
        if (chipDelivery != null) chipDelivery.setOnClickListener(v -> setActiveFilter("DELIVERY"));
        btnScanNext.setOnClickListener(v -> resetScannerToActive());
        btnRetryVerification.setOnClickListener(v -> {
            if (isVerifying) return;
            if (lastRawScan == null || lastRawScan.trim().isEmpty()) {
                Toast.makeText(this, "Nothing to retry — scan again", Toast.LENGTH_SHORT).show();
                return;
            }
            if (cardResult != null) {
                cardResult.setVisibility(View.GONE);
            }
            if (btnRetryVerification != null) {
                btnRetryVerification.setVisibility(View.GONE);
            }
            handleScannedPayload(lastRawScan);
        });

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
            cancelAllVerificationCalls();
            if (currentActiveCall != null) {
                currentActiveCall.cancel();
            }
            hideLoading();
            resetScannerToActive();
        });
    }

    private void showLanguageDialog() {
        final String currentLang = prefs.getString(KEY_APP_LANGUAGE, "en");
        final String[] languages = new String[]{"English (እንግሊዝኛ)", "አማርኛ (Amharic)"};
        final String[] langCodes = new String[]{"en", "am"};
        int selectedIndex = "am".equalsIgnoreCase(currentLang) ? 1 : 0;

        AlertDialog.Builder builder = new AlertDialog.Builder(this);
        builder.setTitle(getString(R.string.choose_language_title));
        builder.setSingleChoiceItems(languages, selectedIndex, (dialog, which) -> {
            dialog.dismiss();
            String chosenCode = langCodes[which];
            if (!chosenCode.equals(currentLang)) {
                setAppLocale(chosenCode);
            }
        });
        builder.setNegativeButton(getString(R.string.btn_cancel), null);
        AlertDialog dialog = builder.create();
        dialog.show();

        if (dialog.getWindow() != null) {
            dialog.getWindow().setBackgroundDrawableResource(R.drawable.bg_result_card);
        }
    }

    private void setAppLocale(String langCode) {
        prefs.edit().putString(KEY_APP_LANGUAGE, langCode).apply();

        try {
            LocaleListCompat appLocale = LocaleListCompat.forLanguageTags(langCode);
            AppCompatDelegate.setApplicationLocales(appLocale);
        } catch (Exception ignored) {}

        try {
            Locale locale = new Locale(langCode);
            Locale.setDefault(locale);
            Resources res = getResources();
            Configuration config = new Configuration(res.getConfiguration());
            config.setLocale(locale);
            res.updateConfiguration(config, res.getDisplayMetrics());
        } catch (Exception ignored) {}

        String msg = "am".equals(langCode) ? "ቋንቋ ወደ አማርኛ ተቀይሯል" : "Language switched to English";
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();

        recreate();
    }

    private void toggleEngineMode() {
        isWebViewMode = !isWebViewMode;
        if (isWebViewMode) {
            barcodeView.pause();
            barcodeView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            btnToggleEngine.setImageResource(R.drawable.ic_camera);

            final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);
            String webUrl = activePosUrl.replaceAll("/+$", "") + "/scanner?key=" + apiKey;
            webView.loadUrl(webUrl);
            Toast.makeText(this, "🌐 Switched to Web Scanner Link Engine", Toast.LENGTH_SHORT).show();
        } else {
            webView.setVisibility(View.GONE);
            barcodeView.setVisibility(View.VISIBLE);
            barcodeView.resume();
            btnToggleEngine.setImageResource(R.drawable.ic_globe);
            Toast.makeText(this, "⚡ Switched to Native App Engine", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (isWebViewMode) {
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
            } else {
                toggleEngineMode(); // Switch back to native scanner
            }
        } else if (cardResult.getVisibility() == View.VISIBLE) {
            resetScannerToActive();
        } else if (isScannerOpen) {
            closeScannerOverlay();
        } else {
            super.onBackPressed();
        }
    }

    private void setupScanner() {
        barcodeView.setStatusText(""); // Hide default camera status label
        try {
            if (barcodeView.getViewFinder() != null) {
                barcodeView.getViewFinder().setVisibility(View.GONE);
            }
        } catch (Exception ignored) {}

        try {
            CameraSettings cameraSettings = barcodeView.getBarcodeView().getCameraSettings();
            if (cameraSettings == null) cameraSettings = new CameraSettings();
            cameraSettings.setContinuousFocusEnabled(true);
            cameraSettings.setAutoFocusEnabled(true);
            barcodeView.getBarcodeView().setCameraSettings(cameraSettings);

            List<BarcodeFormat> formats = Arrays.asList(
                    BarcodeFormat.QR_CODE,
                    BarcodeFormat.DATA_MATRIX,
                    BarcodeFormat.CODE_128,
                    BarcodeFormat.PDF_417
            );
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, formats);
            hints.put(DecodeHintType.CHARACTER_SET, "UTF-8");
            barcodeView.getBarcodeView().setDecoderFactory(new DualDecoderFactory(formats, hints, "UTF-8"));
        } catch (Exception ignored) {}

        barcodeView.decodeContinuous(new BarcodeCallback() {
            @Override
            public void barcodeResult(BarcodeResult result) {
                if (result != null && result.getText() != null && !result.getText().trim().isEmpty()) {
                    if (!isVerifying && cardResult.getVisibility() != View.VISIBLE && !isWebViewMode) {
                        handleScannedPayload(result.getText().trim());
                    }
                }
            }

            @Override
            public void possibleResultPoints(List<ResultPoint> resultPoints) {}
        });
    }

    /**
     * Dual Decoder Factory: decodes QR/Barcodes via ZXing and seamlessly pipes
     * frames without QR codes into Google ML Kit Text Recognition for real-time SMS / USSD OCR.
     */
    private class DualDecoderFactory implements DecoderFactory {
        private final List<BarcodeFormat> formats;
        private final Map<DecodeHintType, Object> hints;
        private final String characterSet;

        DualDecoderFactory(List<BarcodeFormat> formats, Map<DecodeHintType, Object> hints, String characterSet) {
            this.formats = formats;
            this.hints = hints;
            this.characterSet = characterSet;
        }

        @Override
        public Decoder createDecoder(Map<DecodeHintType, ?> baseHints) {
            Map<DecodeHintType, Object> mergedHints = new EnumMap<>(DecodeHintType.class);
            if (baseHints != null) {
                mergedHints.putAll(baseHints);
            }
            if (this.hints != null) {
                mergedHints.putAll(this.hints);
            }
            if (this.formats != null) {
                mergedHints.put(DecodeHintType.POSSIBLE_FORMATS, this.formats);
            }
            if (this.characterSet != null) {
                mergedHints.put(DecodeHintType.CHARACTER_SET, this.characterSet);
            }

            MultiFormatReader reader = new MultiFormatReader();
            reader.setHints(mergedHints);

            return new Decoder(reader) {
                @Override
                public Result decode(LuminanceSource source) {
                    Result qrResult = super.decode(source);
                    if (qrResult != null) {
                        return qrResult;
                    }

                    // No barcode in this frame -> Run on-device ML Kit OCR for SMS / USSD text
                    processOcrFrame(source);
                    return null;
                }
            };
        }
    }

    /**
     * Process live camera frames for Ethiopian payment references (CBE FT... or Telebirr SMS/USSD).
     */
    private void processOcrFrame(LuminanceSource source) {
        if (textRecognizer == null || isVerifying || isWebViewMode) return;
        if (cardResult != null && cardResult.getVisibility() == View.VISIBLE) return;

        long now = System.currentTimeMillis();
        if (now - lastOcrTriggerTime < 2500) return; // Cooldown after successful scan
        if (now - lastOcrTimestamp < 200) return;    // Throttled to ~5 frames per second

        if (!isOcrProcessing.compareAndSet(false, true)) {
            return;
        }
        lastOcrTimestamp = now;

        try {
            int width = source.getWidth();
            int height = source.getHeight();
            byte[] matrix = source.getMatrix();
            if (matrix == null || matrix.length < width * height) {
                isOcrProcessing.set(false);
                return;
            }

            int[] pixels = new int[width * height];
            for (int i = 0; i < pixels.length; i++) {
                int grey = matrix[i] & 0xFF;
                pixels[i] = 0xFF000000 | (grey << 16) | (grey << 8) | grey;
            }
            Bitmap bmp = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888);
            InputImage inputImage = InputImage.fromBitmap(bmp, 0);

            textRecognizer.process(inputImage)
                    .addOnSuccessListener(visionText -> {
                        bmp.recycle();
                        isOcrProcessing.set(false);

                        if (isVerifying || isWebViewMode || (cardResult != null && cardResult.getVisibility() == View.VISIBLE)) {
                            return;
                        }

                        String rawText = visionText != null ? visionText.getText() : null;
                        ReceiptParser.DetectedPayment detected = ReceiptParser.extractReferenceFromOcrText(rawText);
                        if (detected != null && detected.reference != null && !detected.reference.trim().isEmpty()) {
                            long triggerNow = System.currentTimeMillis();
                            if (triggerNow - lastOcrTriggerTime < 2500) return;

                            String ref = detected.reference.trim();
                            // Debounce logic:
                            // High-certainty patterns (CBE FT... or Telebirr slip URL) trigger immediately.
                            // General text patterns require 2 consecutive frames to prevent motion blur misreads.
                            boolean isHighConfidence = ref.toUpperCase().startsWith("FT") || (rawText != null && rawText.contains("transactioninfo"));
                            if (isHighConfidence || ref.equalsIgnoreCase(lastDetectedOcrRef)) {
                                lastOcrTriggerTime = triggerNow;
                                lastDetectedOcrRef = "";
                                mainHandler.post(() -> {
                                    if (!isVerifying && !isWebViewMode && (cardResult == null || cardResult.getVisibility() != View.VISIBLE)) {
                                        handleScannedPayload(ref);
                                    }
                                });
                            } else {
                                lastDetectedOcrRef = ref;
                            }
                        }
                    })
                    .addOnFailureListener(e -> {
                        bmp.recycle();
                        isOcrProcessing.set(false);
                    });
        } catch (Throwable t) {
            isOcrProcessing.set(false);
        }
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

        discoverAndConnectCashierPc(true);
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
                if (!isWebViewMode) barcodeView.resume();
            } else {
                Toast.makeText(this, R.string.camera_permission_required, Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Only resume camera if scanner overlay was explicitly open
        if (!isWebViewMode && isScannerOpen) barcodeView.resume();
        discoverAndConnectCashierPc(false);
        mainHandler.post(orderPollRunnable);
    }

    @Override
    protected void onPause() {
        super.onPause();
        mainHandler.removeCallbacks(orderPollRunnable);
        if (!isWebViewMode) barcodeView.pause();
        if (isFlashOn) toggleFlashlight();
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacks(orderPollRunnable);
        if (toneGenerator != null) {
            toneGenerator.release();
        }
        if (textRecognizer != null) {
            try {
                textRecognizer.close();
            } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    // ==========================================
    // 🌐 CASHIER PC AUTO-DISCOVERY & CONNECTION
    // ==========================================

    private void discoverAndConnectCashierPc(final boolean showToast) {
        String savedUrl = prefs.getString(KEY_POS_URL, "");
        final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);

        List<String> candidates = new ArrayList<>();
        if (savedUrl != null && !savedUrl.trim().isEmpty()) {
            candidates.add(savedUrl.trim().replaceAll("/+$", ""));
        }
        candidates.add(DEFAULT_LOCAL_URL);  // http://192.168.1.5:3000 (Local Wi-Fi 2ms FIRST!)
        candidates.add(DEFAULT_TUNNEL_URL); // https://scanner.kogna.coffee (Tunnel failover)

        probeCandidates(candidates, 0, apiKey, showToast);
    }

    private void probeCandidates(final List<String> candidates, final int index, final String apiKey, final boolean showToast) {
        if (index >= candidates.size()) {
            mainHandler.post(() -> {
                txtPosStatus.setText(getString(R.string.pos_status_standalone));
                txtPosStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.gold));
                if (showToast) {
                    Toast.makeText(MainActivity.this, "Cannot reach Cashier PC. Tap ⚙️ to configure.", Toast.LENGTH_SHORT).show();
                }
            });
            return;
        }

        final String testUrl = candidates.get(index);
        String probeEndpoint = testUrl + "/api/scanner/orders?key=" + apiKey;

        Request request = new Request.Builder()
                .url(probeEndpoint)
                .header("x-scanner-token", apiKey)
                .build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                probeCandidates(candidates, index + 1, apiKey, showToast);
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    String jsonStr = response.body() != null ? response.body().string() : "{}";
                    mainHandler.post(() -> {
                        activePosUrl = testUrl;
                        txtPosStatus.setText(getString(R.string.pos_status_connected));
                        txtPosStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_green));
                        if (showToast) {
                            Toast.makeText(MainActivity.this, "Connected to Cashier PC!", Toast.LENGTH_SHORT).show();
                        }
                        parseAndRenderOrders(jsonStr);
                    });
                } else {
                    probeCandidates(candidates, index + 1, apiKey, showToast);
                }
            }
        });
    }

    private void fetchOpenOrders(final boolean notifyErrors) {
        final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);
        String endpoint = activePosUrl.replaceAll("/+$", "") + "/api/scanner/orders?key=" + apiKey + "&_t=" + System.currentTimeMillis();

        Request request = new Request.Builder()
                .url(endpoint)
                .header("x-scanner-token", apiKey)
                .build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                if (notifyErrors) {
                    mainHandler.post(() -> Toast.makeText(MainActivity.this, "Failed to fetch orders: " + e.getMessage(), Toast.LENGTH_SHORT).show());
                }
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (response.isSuccessful()) {
                    String json = response.body() != null ? response.body().string() : "{}";
                    mainHandler.post(() -> parseAndRenderOrders(json));
                }
            }
        });
    }

    private void parseAndRenderOrders(String jsonStr) {
        try {
            JSONObject json = new JSONObject(jsonStr);
            if (!json.optBoolean("success", false)) return;

            // Item F: If scanner key is rejected, alert user and do NOT touch caches
            if (json.optBoolean("restricted", false)) {
                if (txtPosStatus != null) {
                    txtPosStatus.setText("● PC connected but scanner key rejected — check ⚙️ Settings");
                    txtPosStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.gold));
                }
                return;
            }

            // Cache Payment Settings (Receiver Phone & CBE Account) from server
            JSONObject settingsObj = json.optJSONObject("settings");
            if (settingsObj != null) {
                String sTelebirr = settingsObj.optString("telebirrReceiverPhone", "").trim();
                String sCbe = settingsObj.optString("cbeReceiverAccount", "").trim();
                String sMerchant = settingsObj.optString("merchantName", "").trim();

                if (!sTelebirr.isEmpty()) cachedTelebirrReceiver = sTelebirr;
                if (!sCbe.isEmpty()) cachedCbeReceiver = sCbe;
                if (!sMerchant.isEmpty()) cachedMerchantName = sMerchant;

                prefs.edit()
                        .putString(KEY_TELEBIRR_RECV, cachedTelebirrReceiver)
                        .putString(KEY_CBE_RECV, cachedCbeReceiver)
                        .putString(KEY_MERCHANT_NAME, cachedMerchantName)
                        .apply();
            }

            JSONArray arr = json.optJSONArray("orders");
            currentOpenOrders.clear();

            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.getJSONObject(i);
                    OpenOrder order = new OpenOrder();
                    order.id = obj.optString("id");
                    order.tableId = obj.optString("tableId");
                    order.displayTitle = obj.optString("displayTitle", "Table");
                    order.total = obj.optDouble("total", 0.0);
                    order.itemsCount = obj.optInt("itemsCount", 0);
                    order.isVerified = obj.optBoolean("isVerified", false);
                    order.isDelivery = obj.optBoolean("isDelivery", false);
                    order.isTakeaway = obj.optBoolean("isTakeaway", false);
                    currentOpenOrders.add(order);
                }
            }

            // Update filter chip labels with live counts
            updateChipCounts();

            // Render 2-column grid with active filter and sort
            refreshOrderGrid();

            // Check if selected order was removed or completed on POS
            if (selectedOrder != null) {
                boolean stillOpen = false;
                for (OpenOrder o : currentOpenOrders) {
                    if (o.id.equals(selectedOrder.id)) {
                        selectedOrder = o; // Update totals
                        stillOpen = true;
                        break;
                    }
                }
                if (!stillOpen) {
                    clearSelectedOrder();
                } else {
                    updateSelectedOrderBanner();
                }
            }

            // Also refresh post-scan table buttons if currently visible
            if (cardResult.getVisibility() == View.VISIBLE && layoutPostScanTablePicker.getVisibility() == View.VISIBLE) {
                populatePostScanTableButtons();
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void applyDuplicateAlertStyle(String message) {
        // Block all future table-linking attempts
        isCurrentResultDuplicate = true;
        lastVerifiedRef = "";
        lastVerifiedProvider = "";
        lastVerifiedAmount = 0.0;
        lastVerifiedPayer = "";
        lastVerifiedReceiver = "";

        // Transform the card into a prominent red alert
        cardResult.setCardBackgroundColor(ContextCompat.getColor(this, R.color.status_red_bg));
        cardResult.setStrokeColor(ContextCompat.getColor(this, R.color.status_red));
        int strokePx = Math.round(3f * getResources().getDisplayMetrics().density);
        cardResult.setStrokeWidth(strokePx);

        imgResultIcon.setImageResource(R.drawable.ic_error_cross);

        txtResultStatus.setText(getString(R.string.duplicate_title));
        txtResultStatus.setTextColor(ContextCompat.getColor(this, R.color.status_red));
        txtResultStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
        txtResultStatus.setTypeface(null, Typeface.BOLD);

        txtResultBadge.setText("⛔ " + getString(R.string.badge_duplicate));
        txtResultBadge.setBackgroundResource(R.drawable.badge_status_red);
        txtResultBadge.setTextColor(ContextCompat.getColor(this, R.color.status_red));
        txtResultBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);

        txtResultAmount.setTextColor(ContextCompat.getColor(this, R.color.status_red));

        int padPx = Math.round(12f * getResources().getDisplayMetrics().density);
        txtResultPosMatch.setText(message);
        txtResultPosMatch.setTextColor(ContextCompat.getColor(this, R.color.white));
        txtResultPosMatch.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f);
        txtResultPosMatch.setTypeface(null, Typeface.BOLD);
        txtResultPosMatch.setBackgroundColor(ContextCompat.getColor(this, R.color.status_red));
        txtResultPosMatch.setPadding(padPx, padPx, padPx, padPx);

        if (layoutPostScanTablePicker != null) {
            layoutPostScanTablePicker.setVisibility(View.GONE);
        }

        // Distinctive triple-buzz error haptics
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0, 250, 100, 250, 100, 250}, -1));
            } else {
                vibrator.vibrate(800);
            }
        }
        playBeep(false);
    }

    private void resetCardToDefaultStyle() {
        cardResult.setCardBackgroundColor(ContextCompat.getColor(this, R.color.surface_card));
        cardResult.setStrokeColor(ContextCompat.getColor(this, R.color.border_gold));
        int strokePx = Math.round(1.5f * getResources().getDisplayMetrics().density);
        cardResult.setStrokeWidth(strokePx);

        txtResultStatus.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f);
        txtResultStatus.setTypeface(null, Typeface.BOLD);

        txtResultBadge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f);

        txtResultAmount.setTextColor(ContextCompat.getColor(this, R.color.gold));

        int padPx = Math.round(12f * getResources().getDisplayMetrics().density);
        int padVertPx = Math.round(6f * getResources().getDisplayMetrics().density);
        txtResultPosMatch.setTextColor(ContextCompat.getColor(this, R.color.gold));
        txtResultPosMatch.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f);
        txtResultPosMatch.setTypeface(null, Typeface.NORMAL);
        txtResultPosMatch.setBackgroundResource(R.drawable.badge_chip);
        txtResultPosMatch.setPadding(padPx, padVertPx, padPx, padVertPx);
    }

    private void toggleOrderSelection(OpenOrder order) {
        if (isCurrentResultDuplicate) {
            Toast.makeText(this, getString(R.string.cannot_link_duplicate), Toast.LENGTH_LONG).show();
            playBeep(false);
            vibrateError();
            return;
        }

        // If order is already verified/linked, tapping it offers to unlink — never opens camera
        if (order.isVerified) {
            new android.app.AlertDialog.Builder(this)
                    .setTitle("Unlink Payment")
                    .setMessage("Remove verified payment from " + order.displayTitle + "?")
                    .setPositiveButton("Unlink", (d, w) -> clearOrderVerification(order))
                    .setNegativeButton("Cancel", null)
                    .show();
            return;
        }

        // If a verified receipt is currently shown, tap = link payment
        if (cardResult != null && cardResult.getVisibility() == View.VISIBLE && lastVerifiedRef != null && !lastVerifiedRef.isEmpty()) {
            linkVerifiedReceiptToOrder(order);
            return;
        }

        if (selectedOrder != null && selectedOrder.id.equals(order.id)) {
            clearSelectedOrder();
        } else {
            selectedOrder = order;
            updateSelectedOrderBanner();
            playBeep(true);
            // Auto-open scanner so cashier can scan immediately after selecting a table
            openScannerOverlay();
        }
    }

    private void clearOrderVerification(final OpenOrder order) {
        showLoading("Unlinking " + order.displayTitle + "...");
        final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);

        List<String> endpoints = new ArrayList<>();
        if (activePosUrl != null && !activePosUrl.trim().isEmpty())
            endpoints.add(activePosUrl.trim().replaceAll("/+$", ""));
        if (!endpoints.contains(DEFAULT_LOCAL_URL)) endpoints.add(DEFAULT_LOCAL_URL);
        if (!endpoints.contains(DEFAULT_TUNNEL_URL)) endpoints.add(DEFAULT_TUNNEL_URL);

        tryClearVerificationEndpoints(endpoints, 0, order, apiKey);
    }

    private void tryClearVerificationEndpoints(List<String> endpoints, int index, OpenOrder order, String apiKey) {
        if (index >= endpoints.size()) {
            mainHandler.post(() -> {
                hideLoading();
                Toast.makeText(this, "Could not reach server to unlink", Toast.LENGTH_SHORT).show();
            });
            return;
        }
        String url = endpoints.get(index) + "/api/scanner/verify-order?orderId=" + order.id + "&key=" + apiKey;
        Request req = new Request.Builder()
                .url(url)
                .addHeader("x-api-key", apiKey)
                .delete()
                .build();
        new OkHttpClient.Builder()
                .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(8, java.util.concurrent.TimeUnit.SECONDS)
                .build()
                .newCall(req).enqueue(new Callback() {
                    @Override public void onFailure(@NonNull Call call, @NonNull IOException e) {
                        tryClearVerificationEndpoints(endpoints, index + 1, order, apiKey);
                    }
                    @Override public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                        final String body = response.body() != null ? response.body().string() : "{}";
                        if (response.isSuccessful()) {
                            mainHandler.post(() -> {
                                hideLoading();
                                try {
                                    JSONObject res = new JSONObject(body);
                                    if (res.optBoolean("success", false)) {
                                        Toast.makeText(MainActivity.this, "✅ Payment unlinked from " + order.displayTitle, Toast.LENGTH_SHORT).show();
                                        fetchOpenOrders(false);
                                    } else {
                                        Toast.makeText(MainActivity.this, res.optString("error", "Unlink failed"), Toast.LENGTH_SHORT).show();
                                    }
                                } catch (Exception ex) {
                                    Toast.makeText(MainActivity.this, "Unlink error", Toast.LENGTH_SHORT).show();
                                }
                            });
                        } else {
                            tryClearVerificationEndpoints(endpoints, index + 1, order, apiKey);
                        }
                    }
                });
    }

    private void updateSelectedOrderBanner() {
        if (selectedOrder != null) {
            bannerSelectedOrder.setVisibility(View.VISIBLE);
            txtSelectedOrderTitle.setText(getString(R.string.order_selected_format, String.format(Locale.US, "%s (%.2f ETB)", selectedOrder.displayTitle, selectedOrder.total)));
        } else {
            bannerSelectedOrder.setVisibility(View.GONE);
        }
    }

    private void clearSelectedOrder() {
        selectedOrder = null;
        bannerSelectedOrder.setVisibility(View.GONE);
        fetchOpenOrders(false);
    }

    // ==========================================
    // ⚡ SCAN & VERIFICATION LOGIC (AUTHORITATIVE)
    // ==========================================

    public static class DetectedPayment {
        public String provider = "UNKNOWN";
        public String reference = "";
        public String slipUrl = "";
        public boolean isTelebirr = false;
        public boolean isCbe = false;
    }

    private DetectedPayment detectPayment(String rawInput) {
        ReceiptParser.DetectedPayment parsed = ReceiptParser.detectPayment(rawInput);
        DetectedPayment res = new DetectedPayment();
        res.provider = parsed.provider;
        res.reference = parsed.reference;
        res.slipUrl = parsed.slipUrl;
        res.isTelebirr = parsed.isTelebirr;
        res.isCbe = parsed.isCbe;
        return res;
    }

    private void handleScannedPayload(final String payload) {
        lastRawScan = payload;
        isCurrentResultDuplicate = false;
        isVerifying = true;
        barcodeView.pause();
        playBeep(true);

        showLoading("Verifying official bank slip & receiver...");

        new Thread(() -> {
            DetectedPayment payment = detectPayment(payload);
            startDirectPhoneVerification(payment);
        }).start();
    }

    private void startDirectPhoneVerification(final DetectedPayment payment) {
        cancelAllVerificationCalls();
        final String reference = payment.reference;
        final String provider = payment.provider;
        final String slipUrl = payment.slipUrl;
        lastVerifiedUrl = slipUrl;

        if (reference == null || reference.isEmpty()) {
            mainHandler.post(() -> showVerificationResult(
                    false, provider, "-", 0.0, "-", "-",
                    "-", "INVALID QR CODE", "", "❌ Unable to extract transaction reference from QR code"
            ));
            return;
        }

        final AtomicBoolean isResolved = new AtomicBoolean(false);
        final AtomicBoolean posTriggered = new AtomicBoolean(false);
        final AtomicBoolean directFinished = new AtomicBoolean(false);
        final AtomicBoolean posFinished = new AtomicBoolean(false);

        final boolean isCbe = "CBE".equalsIgnoreCase(provider);
        final boolean isCbeFt = isCbe && (reference.toUpperCase().startsWith("FT") || (slipUrl != null && slipUrl.contains("id=FT")));
        final boolean isCbeV2 = isCbe && reference.toLowerCase().startsWith("v2-");
        final boolean canDirectVerify = "TELEBIRR".equalsIgnoreCase(provider) || (isCbe && isCbeV2);

        final Runnable triggerPosFallback = () -> {
            if (!isResolved.get() && posTriggered.compareAndSet(false, true)) {
                if (hedgedFallbackRunnable != null) {
                    mainHandler.removeCallbacks(hedgedFallbackRunnable);
                }
                startPosRoute(payment, isResolved, posFinished, directFinished, isCbeFt);
            }
        };

        final Runnable checkAllFailed = () -> {
            checkAllVerificationRoutesFailed(payment, isResolved, posFinished, directFinished, isCbeFt);
        };

        if (!canDirectVerify) {
            // CBE FT references or non-v2 CBE URLs: Direct bank verification cannot parse PDFs on device.
            // Go straight to POS route immediately (Cashier PC parses PDF via pdf-parse).
            directFinished.set(true);
            triggerPosFallback.run();
            return;
        }

        // Schedule hedged fallback: If bank gateway hasn't produced a verdict within 2s, also query POS endpoints
        hedgedFallbackRunnable = () -> {
            if (!isResolved.get()) {
                triggerPosFallback.run();
            }
        };
        mainHandler.postDelayed(hedgedFallbackRunnable, 2000);

        if ("TELEBIRR".equalsIgnoreCase(provider)) {
            Request directReq = new Request.Builder()
                    .url(slipUrl)
                    .header("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36")
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
                    .header("Accept-Language", "en-US,en;q=0.9,am;q=0.8")
                    .header("Cache-Control", "no-cache")
                    .header("Connection", "keep-alive")
                    .build();

            executeTelebirrDirect(1, payment, telebirrHttpClient != null ? telebirrHttpClient : httpClient,
                    directReq, isResolved, triggerPosFallback, checkAllFailed, directFinished);

        } else if (isCbe && isCbeV2) {
            final String cleanToken = reference.replaceAll("[?#].*$", "").replaceAll("/+$", "");
            String cbeUrl = "https://mb.cbe.com.et/api/v1/transactions/public/transaction-detail/" + cleanToken;

            Request directReq = new Request.Builder()
                    .url(cbeUrl)
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .header("X-App-ID", "d1292e42-7400-49de-a2d3-9731caa4c819")
                    .header("X-App-Version", "0a01980b-9859-1369-8198-59f403820000")
                    .header("Accept", "application/json")
                    .header("Connection", "keep-alive")
                    .build();

            executeCbeDirect(payment, directReq, cleanToken, isResolved, triggerPosFallback, checkAllFailed, directFinished);
        }
    }

    private void executeTelebirrDirect(
            final int attempt,
            final DetectedPayment payment,
            final OkHttpClient client,
            final Request directReq,
            final AtomicBoolean isResolved,
            final Runnable triggerPosFallback,
            final Runnable checkAllFailed,
            final AtomicBoolean directFinished
    ) {
        if (isResolved.get()) return;

        Call directCall = client.newCall(directReq);
        activeVerificationCalls.add(directCall);

        directCall.enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                if (isResolved.get()) return;
                if (attempt < 2) {
                    executeTelebirrDirect(attempt + 1, payment, client, directReq, isResolved, triggerPosFallback, checkAllFailed, directFinished);
                } else {
                    directFinished.set(true);
                    triggerPosFallback.run();
                    checkAllFailed.run();
                }
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (isResolved.get()) return;

                if (response.code() >= 500 && attempt < 2) {
                    executeTelebirrDirect(attempt + 1, payment, client, directReq, isResolved, triggerPosFallback, checkAllFailed, directFinished);
                    return;
                }

                if (response.isSuccessful() && response.body() != null) {
                    String html = response.body().string();
                    ReceiptParser.TelebirrReceipt receipt = ReceiptParser.parseTelebirrReceiptHtml(payment.reference, html);
                    if (receipt.isValid && receipt.isCompleted) {
                        boolean won = evaluateInstantTelebirr(payment.reference, receipt, html, payment.slipUrl, isResolved);
                        if (won) return;
                    }

                    // Candidate swap retry: If verification failed and reference contains 'O' or '0', try the alternate candidate
                    if (attempt == 1 && (payment.reference.contains("O") || payment.reference.contains("0"))) {
                        String altRef = payment.reference.contains("O")
                                ? payment.reference.replace('O', '0')
                                : payment.reference.replace('0', 'O');
                        if (!altRef.equals(payment.reference)) {
                            DetectedPayment altPayment = new DetectedPayment();
                            altPayment.provider = payment.provider;
                            altPayment.reference = altRef;
                            altPayment.slipUrl = "https://transactioninfo.ethiotelecom.et/receipt/" + altRef;
                            altPayment.isTelebirr = true;

                            Request altReq = directReq.newBuilder().url(altPayment.slipUrl).build();
                            executeTelebirrDirect(2, altPayment, client, altReq, isResolved, triggerPosFallback, checkAllFailed, directFinished);
                            return;
                        }
                    }
                }

                directFinished.set(true);
                triggerPosFallback.run();
                checkAllFailed.run();
            }
        });
    }

    private void executeCbeDirect(
            final DetectedPayment payment,
            final Request directReq,
            final String cleanToken,
            final AtomicBoolean isResolved,
            final Runnable triggerPosFallback,
            final Runnable checkAllFailed,
            final AtomicBoolean directFinished
    ) {
        if (isResolved.get()) return;

        Call directCall = httpClient.newCall(directReq);
        activeVerificationCalls.add(directCall);

        directCall.enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                if (isResolved.get()) return;
                directFinished.set(true);
                triggerPosFallback.run();
                checkAllFailed.run();
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                if (isResolved.get()) return;

                if (response.isSuccessful() && response.body() != null) {
                    try {
                        String bodyStr = response.body().string();
                        JSONObject data = new JSONObject(bodyStr);
                        ReceiptParser.CbeReceipt receipt = ReceiptParser.parseCbeJson(cleanToken, data);
                        if (receipt.isValid && receipt.isCompleted) {
                            boolean won = evaluateInstantCbe(cleanToken, receipt, payment.slipUrl, isResolved);
                            if (won) return;
                        }
                    } catch (Exception ignored) {}
                }

                directFinished.set(true);
                triggerPosFallback.run();
                checkAllFailed.run();
            }
        });
    }

    private void startPosRoute(
            final DetectedPayment payment,
            final AtomicBoolean isResolved,
            final AtomicBoolean posFinished,
            final AtomicBoolean directFinished,
            final boolean isCbeFt
    ) {
        if (isResolved.get()) return;

        List<String> targetEndpoints = new ArrayList<>();
        if (activePosUrl != null && !activePosUrl.trim().isEmpty()) {
            targetEndpoints.add(activePosUrl.trim().replaceAll("/+$", ""));
        }
        if (!targetEndpoints.contains(DEFAULT_LOCAL_URL)) {
            targetEndpoints.add(DEFAULT_LOCAL_URL);
        }
        if (!targetEndpoints.contains(DEFAULT_TUNNEL_URL)) {
            targetEndpoints.add(DEFAULT_TUNNEL_URL);
        }

        tryVerifyPosEndpoints(targetEndpoints, 0, payment, isResolved, posFinished, directFinished, isCbeFt);
    }

    private void tryVerifyPosEndpoints(
            final List<String> endpoints,
            final int index,
            final DetectedPayment payment,
            final AtomicBoolean isResolved,
            final AtomicBoolean posFinished,
            final AtomicBoolean directFinished,
            final boolean isCbeFt
    ) {
        if (isResolved.get()) return;

        if (index >= endpoints.size()) {
            posFinished.set(true);
            checkAllVerificationRoutesFailed(payment, isResolved, posFinished, directFinished, isCbeFt);
            return;
        }

        final String currentBaseUrl = endpoints.get(index);
        final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);
        final String targetOrderId = (selectedOrder != null) ? selectedOrder.id : null;
        final String targetOrderTitle = (selectedOrder != null) ? selectedOrder.displayTitle : null;
        final double expectedBill = (selectedOrder != null) ? selectedOrder.total : 0.0;

        try {
            JSONObject body = new JSONObject();
            body.put("referenceOrUrl", payment.reference);
            body.put("provider", payment.provider);
            if (targetOrderId != null) {
                body.put("orderId", targetOrderId);
                body.put("expectedAmount", expectedBill);
            }

            RequestBody requestBody = RequestBody.Companion.create(
                    body.toString(),
                    MediaType.Companion.parse("application/json; charset=utf-8")
            );

            Request request = new Request.Builder()
                    .url(currentBaseUrl + "/api/verify-receipt")
                    .header("x-scanner-token", apiKey)
                    .post(requestBody)
                    .build();

            Call posCall = httpClient.newCall(request);
            activeVerificationCalls.add(posCall);

            posCall.enqueue(new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    tryVerifyPosEndpoints(endpoints, index + 1, payment, isResolved, posFinished, directFinished, isCbeFt);
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    if (isResolved.get()) return;

                    if (response.isSuccessful()) {
                        activePosUrl = currentBaseUrl;
                        String jsonStr = response.body() != null ? response.body().string() : "{}";
                        if (isResolved.compareAndSet(false, true)) {
                            cancelAllVerificationCalls();
                            mainHandler.post(() -> handleServerVerificationResponse(true, response.code(), jsonStr, payment.reference, payment.provider, payment.slipUrl, targetOrderTitle));
                        }
                    } else if (response.code() >= 500) {
                        tryVerifyPosEndpoints(endpoints, index + 1, payment, isResolved, posFinished, directFinished, isCbeFt);
                    } else {
                        // Authoritative 4xx response from Cashier PC (Duplicate, Wrong Receiver, Underpaid, etc.)
                        String jsonStr = response.body() != null ? response.body().string() : "{}";
                        if (isResolved.compareAndSet(false, true)) {
                            cancelAllVerificationCalls();
                            mainHandler.post(() -> handleServerVerificationResponse(false, response.code(), jsonStr, payment.reference, payment.provider, payment.slipUrl, targetOrderTitle));
                        }
                    }
                }
            });

        } catch (Exception e) {
            tryVerifyPosEndpoints(endpoints, index + 1, payment, isResolved, posFinished, directFinished, isCbeFt);
        }
    }

    private void checkAllVerificationRoutesFailed(
            final DetectedPayment payment,
            final AtomicBoolean isResolved,
            final AtomicBoolean posFinished,
            final AtomicBoolean directFinished,
            final boolean isCbeFt
    ) {
        if (directFinished.get() && posFinished.get()) {
            if (isResolved.compareAndSet(false, true)) {
                cancelAllVerificationCalls();
                mainHandler.post(() -> {
                    final String prov = payment.provider != null ? payment.provider.toUpperCase() : "";
                    if (isCbeFt) {
                        showVerificationResult(
                                false, "CBE", payment.reference, 0.0, "-", "-",
                                "-", "CBE FT SLIP", payment.slipUrl,
                                "❌ CBE FT slips need the Cashier PC — open the official slip"
                        );
                    } else if ("BOA".equals(prov)) {
                        showVerificationResult(
                                false, "BOA", payment.reference, 0.0, "-", "-",
                                "-", "BOA SLIP", payment.slipUrl,
                                "❌ BOA receipt needs Cashier PC. Tap 'View Official Bank Slip' to open cs.bankofabyssinia.com"
                        );
                    } else if ("AWASH".equals(prov)) {
                        showVerificationResult(
                                false, "AWASH", payment.reference, 0.0, "-", "-",
                                "-", "AWASH SLIP", payment.slipUrl,
                                "❌ Awash receipt needs Cashier PC. Tap 'View Official Bank Slip' to open awashpay.awashbank.com"
                        );
                    } else if ("DASHEN".equals(prov)) {
                        showVerificationResult(
                                false, "DASHEN", payment.reference, 0.0, "-", "-",
                                "-", "DASHEN SLIP", payment.slipUrl,
                                "❌ Dashen receipt needs Cashier PC. Tap 'View Official Bank Slip' to open receipt.dashensuperapp.com"
                        );
                    } else {
                        showVerificationResult(
                                false, payment.provider, payment.reference, 0.0, "-", "-",
                                "-", "ALL ROUTES FAILED", payment.slipUrl,
                                "❌ All verification routes timed out or failed. Tap 'View Official Bank Slip' below."
                        );
                    }
                    playBeep(false);
                    vibrateError();
                });
            }
        }
    }

    private boolean evaluateInstantTelebirr(
            final String reference,
            final ReceiptParser.TelebirrReceipt receipt,
            final String htmlContent,
            final String slipUrl,
            final AtomicBoolean isResolved
    ) {
        final double amount = receipt.amount;
        final String dateTime = receipt.dateTime;

        final String finalPayer = (receipt.payerName != null && !receipt.payerName.isEmpty())
                ? receipt.payerName
                : (receipt.payerPhone != null && !receipt.payerPhone.isEmpty() ? receipt.payerPhone : "Customer");
        final String finalReceiver = (receipt.receiverName != null && !receipt.receiverName.isEmpty())
                ? receipt.receiverName
                : (receipt.receiverPhone != null && !receipt.receiverPhone.isEmpty() ? receipt.receiverPhone : cachedMerchantName);

        // 🚨 1. FRAUD CHECK: Receiver Account Match
        boolean receiverMatched = matchReceiver("TELEBIRR", receipt.receiverPhone, receipt.receiverName);
        if (!receiverMatched) {
            if (isResolved.compareAndSet(false, true)) {
                cancelAllVerificationCalls();
                mainHandler.post(() -> {
                    showVerificationResult(
                            false, "TELEBIRR", reference, amount, finalPayer, finalReceiver,
                            dateTime, "RECEIVER MISMATCH", slipUrl,
                            "🚨 FRAUD ALERT: Payment credited to " + finalReceiver + ", NOT your official account (" + cachedTelebirrReceiver + ")!"
                    );
                    txtResultBadge.setText("WRONG RECV");
                    playBeep(false);
                    vibrateError();
                });
            }
            return true;
        }

        // 🚨 2. UNDERPAYMENT CHECK against selected table
        if (selectedOrder != null && selectedOrder.total > 0 && amount < selectedOrder.total - 0.5) {
            if (isResolved.compareAndSet(false, true)) {
                cancelAllVerificationCalls();
                mainHandler.post(() -> {
                    showVerificationResult(
                            false, "TELEBIRR", reference, amount, finalPayer, finalReceiver,
                            dateTime, "AMOUNT TOO LOW", slipUrl,
                            String.format(Locale.US, "❌ Bill is %.2f ETB but slip is %.2f ETB (Short by %.2f ETB)", selectedOrder.total, amount, selectedOrder.total - amount)
                    );
                    txtResultBadge.setText("UNDERPAID");
                    playBeep(false);
                    vibrateError();
                });
            }
            return true;
        }

        // 🏆 DIRECT PHONE VERIFICATION VERIFIED! Show genuine green card immediately!
        if (isResolved.compareAndSet(false, true)) {
            cancelAllVerificationCalls();
            lastVerifiedRef = reference;
            lastVerifiedProvider = "TELEBIRR";
            lastVerifiedAmount = amount;
            lastVerifiedPayer = finalPayer;
            lastVerifiedReceiver = finalReceiver;

            final String initialPosMsg = (selectedOrder != null)
                    ? "⚡ Linking to " + selectedOrder.displayTitle + "..."
                    : "⚡ Syncing with Cashier PC...";

            mainHandler.post(() -> {
                showVerificationResult(
                        true, "TELEBIRR", reference, amount, finalPayer, finalReceiver,
                        dateTime, null, slipUrl, initialPosMsg
                );
            });

            // Sync with POS in background (non-blocking)
            syncVerifiedSlipInBackground(reference, "TELEBIRR", htmlContent, slipUrl, amount, finalPayer, finalReceiver);
            return true;
        }
        return false;
    }

    private boolean evaluateInstantCbe(
            final String reference,
            final ReceiptParser.CbeReceipt receipt,
            final String slipUrl,
            final AtomicBoolean isResolved
    ) {
        try {
            if (!receipt.isValid || !receipt.isCompleted) {
                return false;
            }

            final double amount = receipt.amount;
            final String payer = (receipt.payerName != null && !receipt.payerName.isEmpty()) ? receipt.payerName : "Customer";
            final String receiver = (receipt.receiverName != null && !receipt.receiverName.isEmpty()) ? receipt.receiverName : cachedMerchantName;
            final String receiverAcc = receipt.receiverAccount;
            final String dateTime = receipt.dateTime;

            // 🚨 1. Receiver Account Check
            boolean receiverMatched = matchReceiver("CBE", receiverAcc, receiver);
            if (!receiverMatched) {
                if (isResolved.compareAndSet(false, true)) {
                    cancelAllVerificationCalls();
                    mainHandler.post(() -> {
                        showVerificationResult(
                                false, "CBE", reference, amount, payer, receiver,
                                dateTime, "RECEIVER MISMATCH", slipUrl,
                                "🚨 FRAUD ALERT: Payment credited to " + receiver + " (" + receiverAcc + "), NOT your official CBE account (" + cachedCbeReceiver + ")!"
                        );
                        txtResultBadge.setText("WRONG RECV");
                        playBeep(false);
                        vibrateError();
                    });
                }
                return true;
            }

            // 🚨 2. Underpayment Check
            if (selectedOrder != null && selectedOrder.total > 0 && amount < selectedOrder.total - 0.5) {
                if (isResolved.compareAndSet(false, true)) {
                    cancelAllVerificationCalls();
                    mainHandler.post(() -> {
                        showVerificationResult(
                                false, "CBE", reference, amount, payer, receiver,
                                dateTime, "AMOUNT TOO LOW", slipUrl,
                                String.format(Locale.US, "❌ Bill is %.2f ETB but slip is %.2f ETB (Short by %.2f ETB)", selectedOrder.total, amount, selectedOrder.total - amount)
                        );
                        txtResultBadge.setText("UNDERPAID");
                        playBeep(false);
                        vibrateError();
                    });
                }
                return true;
            }

            // 🏆 DIRECT PHONE VERIFICATION VERIFIED! Show genuine green card immediately!
            if (isResolved.compareAndSet(false, true)) {
                cancelAllVerificationCalls();
                lastVerifiedRef = reference;
                lastVerifiedProvider = "CBE";
                lastVerifiedAmount = amount;
                lastVerifiedPayer = payer;
                lastVerifiedReceiver = receiver;

                final String initialPosMsg = (selectedOrder != null)
                        ? "⚡ Linking to " + selectedOrder.displayTitle + "..."
                        : "⚡ Syncing with Cashier PC...";

                mainHandler.post(() -> {
                    showVerificationResult(
                            true, "CBE", reference, amount, payer, receiver,
                            dateTime, null, slipUrl, initialPosMsg
                    );
                });

                // Asynchronously sync with POS in background
                syncVerifiedSlipInBackground(reference, "CBE", null, slipUrl, amount, payer, receiver);
                return true;
            }
        } catch (Exception ignored) {}
        return false;
    }

    private void cancelAllVerificationCalls() {
        if (hedgedFallbackRunnable != null) {
            mainHandler.removeCallbacks(hedgedFallbackRunnable);
        }
        synchronized (activeVerificationCalls) {
            for (Call call : activeVerificationCalls) {
                try {
                    if (!call.isCanceled()) {
                        call.cancel();
                    }
                } catch (Exception ignored) {}
            }
            activeVerificationCalls.clear();
        }
    }

    private void syncVerifiedSlipInBackground(
            final String reference,
            final String provider,
            final String htmlContent,
            final String slipUrl,
            final double amount,
            final String payer,
            final String receiver
    ) {
        List<String> targetEndpoints = new ArrayList<>();
        if (activePosUrl != null && !activePosUrl.trim().isEmpty()) {
            targetEndpoints.add(activePosUrl.trim().replaceAll("/+$", ""));
        }
        if (!targetEndpoints.contains(DEFAULT_LOCAL_URL)) {
            targetEndpoints.add(DEFAULT_LOCAL_URL); // http://192.168.1.5:3000 FIRST!
        }
        if (!targetEndpoints.contains(DEFAULT_TUNNEL_URL)) {
            targetEndpoints.add(DEFAULT_TUNNEL_URL); // TUNNEL SECOND!
        }

        tryAsyncBackgroundSync(targetEndpoints, 0, reference, provider, htmlContent, slipUrl, amount, payer, receiver);
    }

    private void tryAsyncBackgroundSync(
            final List<String> endpoints,
            final int index,
            final String reference,
            final String provider,
            final String htmlContent,
            final String slipUrl,
            final double amount,
            final String payer,
            final String receiver
    ) {
        if (index >= endpoints.size()) {
            // Cashier PC currently unreachable
            mainHandler.post(() -> {
                if (cardResult != null && cardResult.getVisibility() == View.VISIBLE && reference.equals(lastVerifiedRef)) {
                    txtResultPosMatch.setText("📱 Verified Genuine on Device (Cashier PC Offline)");
                }
            });
            return;
        }

        final String currentBaseUrl = endpoints.get(index);
        final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);
        final String targetOrderId = (selectedOrder != null) ? selectedOrder.id : null;
        final String targetOrderTitle = (selectedOrder != null) ? selectedOrder.displayTitle : null;
        final double expectedBill = (selectedOrder != null) ? selectedOrder.total : 0.0;

        try {
            JSONObject body = new JSONObject();
            body.put("referenceOrUrl", reference);
            body.put("provider", provider);
            if (targetOrderId != null) {
                body.put("orderId", targetOrderId);
                body.put("expectedAmount", expectedBill);
            }
            if (htmlContent != null && htmlContent.length() > 200) {
                body.put("htmlContent", htmlContent);
            }

            RequestBody requestBody = RequestBody.Companion.create(
                    body.toString(),
                    MediaType.Companion.parse("application/json; charset=utf-8")
            );

            Request request = new Request.Builder()
                    .url(currentBaseUrl + "/api/verify-receipt")
                    .header("x-scanner-token", apiKey)
                    .post(requestBody)
                    .build();

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    tryAsyncBackgroundSync(endpoints, index + 1, reference, provider, htmlContent, slipUrl, amount, payer, receiver);
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    if (response.isSuccessful()) {
                        activePosUrl = currentBaseUrl;
                        String jsonStr = response.body() != null ? response.body().string() : "{}";
                        mainHandler.post(() -> handleBackgroundSyncResponse(jsonStr, response.code(), targetOrderTitle));
                    } else if (response.code() >= 500) {
                        tryAsyncBackgroundSync(endpoints, index + 1, reference, provider, htmlContent, slipUrl, amount, payer, receiver);
                    } else {
                        // 4xx error (e.g. authoritative duplicate, mismatch, underpaid from server)
                        String jsonStr = response.body() != null ? response.body().string() : "{}";
                        mainHandler.post(() -> handleBackgroundSyncResponse(jsonStr, response.code(), targetOrderTitle));
                    }
                }
            });
        } catch (Exception e) {
            tryAsyncBackgroundSync(endpoints, index + 1, reference, provider, htmlContent, slipUrl, amount, payer, receiver);
        }
    }

    private void handleBackgroundSyncResponse(final String jsonStr, final int statusCode, final String targetOrderTitle) {
        try {
            JSONObject json = new JSONObject(jsonStr);
            JSONObject receipt = json.optJSONObject("receipt");

            boolean isDuplicate = json.optBoolean("duplicate", false)
                    || json.optBoolean("isDuplicate", false)
                    || (receipt != null && receipt.optBoolean("isDuplicate", false));
            boolean isReceiverMismatch = json.optBoolean("receiverMismatch", false)
                    || (receipt != null && !receipt.optBoolean("isReceiverMatched", true));
            boolean isUnderpaid = json.optBoolean("underpaid", false)
                    || (receipt != null && receipt.optBoolean("isUnderpaid", false));
            String errorMsg = json.optString("error", receipt != null ? receipt.optString("errorMessage", "") : "");

            if (isDuplicate) {
                applyDuplicateAlertStyle(!errorMsg.isEmpty() ? errorMsg : getString(R.string.duplicate_pos_msg));
                return;
            }

            if (isReceiverMismatch) {
                lastVerifiedRef = "";
                txtResultBadge.setText(getString(R.string.badge_wrong_recv));
                txtResultBadge.setBackgroundResource(R.drawable.badge_status_red);
                txtResultBadge.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_red));
                txtResultPosMatch.setText(!errorMsg.isEmpty() ? errorMsg : getString(R.string.receiver_mismatch_msg, cachedTelebirrReceiver));
                if (layoutPostScanTablePicker != null) layoutPostScanTablePicker.setVisibility(View.GONE);
                playBeep(false);
                vibrateError();
                return;
            }

            if (isUnderpaid) {
                txtResultBadge.setText("UNDERPAID");
                txtResultBadge.setBackgroundResource(R.drawable.badge_status_red);
                txtResultBadge.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_red));
                txtResultPosMatch.setText(!errorMsg.isEmpty() ? errorMsg : "❌ Scanned amount is less than order bill!");
                if (layoutPostScanTablePicker != null) layoutPostScanTablePicker.setVisibility(View.GONE);
                playBeep(false);
                vibrateError();
                return;
            }

            if (statusCode >= 200 && statusCode < 300) {
                JSONObject linkedOrder = json.optJSONObject("linkedOrder");
                if (linkedOrder != null) {
                    String tableNum = linkedOrder.optString("tableNumber", "");
                    String orderName = (targetOrderTitle != null && !targetOrderTitle.isEmpty())
                            ? targetOrderTitle
                            : (!tableNum.isEmpty() && !"?".equals(tableNum) ? "Table " + tableNum : "Table");
                    txtResultPosMatch.setText(String.format(Locale.US, "✅ Linked to %s (Marked Paid on Cashier PC!)", orderName));
                    playBeep(true);
                    clearSelectedOrder();
                    fetchOpenOrders(false);
                    updateHistoryLinked(lastVerifiedRef, orderName);
                    if (layoutPostScanTablePicker != null) layoutPostScanTablePicker.setVisibility(View.GONE);
                } else {
                    txtResultPosMatch.setText("✅ Recorded on Cashier PC");
                    if (layoutPostScanTablePicker != null) {
                        if (!currentOpenOrders.isEmpty()) {
                            layoutPostScanTablePicker.setVisibility(View.VISIBLE);
                            populatePostScanTableButtons();
                        } else {
                            layoutPostScanTablePicker.setVisibility(View.GONE);
                        }
                    }
                }
            } else if (!errorMsg.isEmpty()) {
                txtResultPosMatch.setText(errorMsg);
            }
        } catch (Exception ex) {
            if (statusCode >= 200 && statusCode < 300) {
                txtResultPosMatch.setText("✅ Recorded on Cashier PC");
            }
        }
    }


    private void handleServerVerificationResponse(
            boolean isHttpOk,
            int statusCode,
            String jsonStr,
            String reference,
            String provider,
            String slipUrl,
            String targetOrderTitle
    ) {
        try {
            JSONObject res = new JSONObject(jsonStr);
            JSONObject receipt = res.optJSONObject("receipt");

            double amount = receipt != null ? receipt.optDouble("amount", 0.0) : 0.0;
            String payer = receipt != null ? receipt.optString("payerName", "Customer") : "Customer";
            String receiver = receipt != null ? receipt.optString("receiverName", cachedMerchantName) : cachedMerchantName;
            String ref = receipt != null ? receipt.optString("reference", reference) : reference;
            String date = receipt != null ? receipt.optString("dateTime", "-") : "-";

            boolean isDuplicate = res.optBoolean("duplicate", false) || (receipt != null && receipt.optBoolean("isDuplicate", false));
            boolean isReceiverMismatch = res.optBoolean("receiverMismatch", false) || (receipt != null && !receipt.optBoolean("isReceiverMatched", true));
            boolean isUnderpaid = res.optBoolean("underpaid", false) || (receipt != null && receipt.optBoolean("isUnderpaid", false));
            String errorMsg = res.optString("error", receipt != null ? receipt.optString("errorMessage", "") : "");

            if (isHttpOk && receipt != null && receipt.optBoolean("success", false) && !isReceiverMismatch && !isDuplicate && !isUnderpaid) {
                // ✅ 100% GENUINE & VERIFIED
                lastVerifiedRef = ref;
                lastVerifiedProvider = provider;
                lastVerifiedAmount = amount;
                lastVerifiedPayer = payer;
                lastVerifiedReceiver = receiver;

                String posMatchMsg;
                boolean orderLinked = false;

                if (targetOrderTitle != null) {
                    posMatchMsg = String.format(Locale.US, "✅ Linked to %s (Marked Paid on Cashier PC!)", targetOrderTitle);
                    orderLinked = true;
                    clearSelectedOrder();
                    fetchOpenOrders(false);
                } else {
                    posMatchMsg = "✅ Payment Verified! Tap a table below to link:";
                }

                showVerificationResult(
                        true, provider, ref, amount, payer, receiver,
                        date, null, slipUrl, posMatchMsg
                );

                if (!orderLinked) {
                    layoutPostScanTablePicker.setVisibility(View.VISIBLE);
                    populatePostScanTableButtons();
                } else {
                    layoutPostScanTablePicker.setVisibility(View.GONE);
                }

            } else {
                // ❌ REJECTED (Fraud, Duplicate, Underpaid, or Mismatch)
                layoutPostScanTablePicker.setVisibility(View.GONE);

                String badge;
                String title;
                String posMatch;

                if (isReceiverMismatch) {
                    badge = "WRONG RECV";
                    title = "RECEIVER MISMATCH";
                    posMatch = "🚨 FRAUD ALERT: Payment credited to " + receiver + ", NOT your official business account!";
                } else if (isDuplicate) {
                    badge = "DUPLICATE";
                    title = "DUPLICATE RECEIPT";
                    posMatch = "❌ " + (errorMsg.isEmpty() ? "Receipt reference already used on another order!" : errorMsg);
                } else if (isUnderpaid) {
                    badge = "UNDERPAID";
                    title = "AMOUNT TOO LOW";
                    posMatch = "❌ " + (errorMsg.isEmpty() ? "Amount paid is less than the table bill!" : errorMsg);
                } else {
                    badge = "FAILED";
                    title = "VERIFICATION FAILED";
                    posMatch = "❌ " + (errorMsg.isEmpty() ? "Invalid or unconfirmed receipt" : errorMsg);
                }

                showVerificationResult(
                        false, provider, ref, amount, payer, receiver,
                        date, title, slipUrl, posMatch
                );
                txtResultBadge.setText(badge);

                if (isDuplicate) {
                    final String duplicateMsg = posMatch;
                    mainHandler.post(() -> applyDuplicateAlertStyle(duplicateMsg));
                }
            }

        } catch (Exception e) {
            showVerificationResult(
                    false, provider, reference, 0.0, "-", "-",
                    "-", "Error parsing server response", slipUrl, "❌ Verification Error"
            );
        }
    }

    /**
     * Fallback validation when Cashier PC is unreachable
     */
    private void handleOfflineVerificationFallback(
            String reference,
            String provider,
            String htmlContent,
            String slipUrl
    ) {
        if (htmlContent != null && htmlContent.length() > 300) {
            String payerName = extractHtmlField(htmlContent, "Payer\\s*Name");
            String payerPhone = extractHtmlField(htmlContent, "Payer\\s*telebirr");
            String receiverName = extractHtmlField(htmlContent, "Credited\\s*Party\\s*name");
            String receiverPhone = extractHtmlField(htmlContent, "Credited\\s*party\\s*account\\s*no");
            if (receiverPhone == null) receiverPhone = extractHtmlField(htmlContent, "Receiver\\s*telebirr");

            double amount = 0.0;
            Matcher settledMatch = Pattern.compile("(?:Settled\\s*Amount|የተከፈለው\\s*መጠን)[\\s\\S]*?([\\d,.]+)\\s*Birr", Pattern.CASE_INSENSITIVE).matcher(htmlContent);
            if (settledMatch.find()) {
                amount = parseDoubleSafe(settledMatch.group(1));
            }

            String dateTime = "-";
            Matcher dateMatch = Pattern.compile("(\\d{2}-\\d{2}-\\d{4}\\s+\\d{2}:\\d{2}:\\d{2})").matcher(htmlContent);
            if (dateMatch.find()) dateTime = dateMatch.group(1);

            final String finalPayer = (payerName != null && !payerName.isEmpty()) ? payerName : (payerPhone != null ? payerPhone : "Customer");
            final String finalReceiver = (receiverName != null && !receiverName.isEmpty()) ? receiverName : (receiverPhone != null ? receiverPhone : cachedMerchantName);

            // 🚨 STRICT OFFLINE RECEIVER MATCH CHECK
            boolean receiverMatched = matchReceiver(provider, receiverPhone, receiverName);
            if (!receiverMatched) {
                showVerificationResult(
                        false, provider, reference, amount, finalPayer, finalReceiver,
                        dateTime, "RECEIVER MISMATCH", slipUrl,
                        "🚨 FRAUD ALERT: Payment credited to " + finalReceiver + ", NOT your official business account (" + cachedTelebirrReceiver + ")!"
                );
                txtResultBadge.setText("WRONG RECV");
                return;
            }

            // Check if selected order bill matches
            if (selectedOrder != null && selectedOrder.total > 0 && amount < selectedOrder.total - 0.5) {
                showVerificationResult(
                        false, provider, reference, amount, finalPayer, finalReceiver,
                        dateTime, "AMOUNT TOO LOW", slipUrl,
                        String.format(Locale.US, "❌ Bill is %.2f ETB but slip is %.2f ETB (Short by %.2f ETB)", selectedOrder.total, amount, selectedOrder.total - amount)
                );
                txtResultBadge.setText("UNDERPAID");
                return;
            }

            lastVerifiedRef = reference;
            lastVerifiedProvider = provider;
            lastVerifiedAmount = amount;
            lastVerifiedPayer = finalPayer;
            lastVerifiedReceiver = finalReceiver;

            showVerificationResult(
                    true, provider, reference, amount, finalPayer, finalReceiver,
                    dateTime, null, slipUrl,
                    "📱 Verified Genuine on Device (Cashier PC Offline)"
            );
        } else {
            showVerificationResult(
                    false, provider, reference, 0.0, "-", "-",
                    "-", "Cannot Reach Cashier PC", slipUrl, "❌ PC Offline & Slip not cached"
            );
        }
    }

    private boolean matchReceiver(String provider, String receivedPhone, String receivedName) {
        if ("TELEBIRR".equalsIgnoreCase(provider)) {
            boolean matched = ReceiptParser.matchMaskedAccountOrPhone(cachedTelebirrReceiver, receivedPhone);
            if (matched) return true;

            // Check merchant name fallback
            if (receivedName != null && cachedMerchantName != null && !cachedMerchantName.trim().isEmpty()) {
                String cleanRecv = receivedName.toLowerCase().replaceAll("[^a-z0-9]", "");
                String cleanMerch = cachedMerchantName.toLowerCase().replaceAll("[^a-z0-9]", "");
                if (cleanRecv.contains(cleanMerch) || cleanMerch.contains(cleanRecv)) {
                    return true;
                }
            }
            return false;
        } else if ("CBE".equalsIgnoreCase(provider)) {
            return ReceiptParser.matchMaskedAccountOrPhone(cachedCbeReceiver, receivedPhone);
        }
        return true;
    }

    private void populatePostScanTableButtons() {
        mainHandler.post(() -> {
            if (layoutPostScanTableButtons == null) return;
            layoutPostScanTableButtons.removeAllViews();
            if (currentOpenOrders.isEmpty()) {
                TextView none = new TextView(MainActivity.this);
                none.setText("No open tables on Cashier PC");
                none.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.text_secondary));
                none.setTextSize(12);
                layoutPostScanTableButtons.addView(none);
                return;
            }

            int dp8 = Math.round(8f * getResources().getDisplayMetrics().density);
            int dp4 = Math.round(4f * getResources().getDisplayMetrics().density);
            LinearLayout currentRow = null;
            int colIndex = 0;

            for (final OpenOrder order : currentOpenOrders) {
                if (colIndex % 2 == 0) {
                    currentRow = new LinearLayout(MainActivity.this);
                    currentRow.setOrientation(LinearLayout.HORIZONTAL);
                    LinearLayout.LayoutParams rowLp = new LinearLayout.LayoutParams(
                            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                    rowLp.setMargins(0, 0, 0, dp8);
                    currentRow.setLayoutParams(rowLp);
                    layoutPostScanTableButtons.addView(currentRow);
                }

                TextView chip = new TextView(MainActivity.this);
                chip.setText(String.format(Locale.US, "%s\n%.0f ETB", order.displayTitle, order.total));
                chip.setBackgroundResource(order.isVerified ? R.drawable.badge_status_green : R.drawable.bg_order_chip);
                chip.setTextColor(ContextCompat.getColor(MainActivity.this, order.isVerified ? R.color.status_green : R.color.gold));
                chip.setTextSize(12);
                chip.setPadding(dp8, dp8, dp8, dp8);
                chip.setClickable(true);
                chip.setFocusable(true);
                chip.setGravity(android.view.Gravity.CENTER);

                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
                if (colIndex % 2 == 0) lp.setMargins(0, 0, dp4, 0);
                else lp.setMargins(dp4, 0, 0, 0);
                chip.setLayoutParams(lp);

                chip.setOnClickListener(v -> linkVerifiedReceiptToOrder(order));
                if (currentRow != null) currentRow.addView(chip);
                colIndex++;
            }
        });
    }

    private void linkVerifiedReceiptToOrder(final OpenOrder targetOrder) {
        if (isCurrentResultDuplicate) {
            Toast.makeText(this, "🚨 Cannot link: Duplicate receipt!", Toast.LENGTH_SHORT).show();
            return;
        }
        if (lastVerifiedRef == null || lastVerifiedRef.isEmpty()) {
            Toast.makeText(this, "No verified receipt to link", Toast.LENGTH_SHORT).show();
            return;
        }
        if (isLinkingInFlight) return;
        isLinkingInFlight = true;

        showLoading("Linking payment to " + targetOrder.displayTitle + "...");
        final String apiKey = prefs.getString(KEY_API_KEY, DEFAULT_API_KEY);

        try {
            JSONObject body = new JSONObject();
            body.put("orderId", targetOrder.id);
            body.put("reference", lastVerifiedRef);
            body.put("provider", lastVerifiedProvider);
            body.put("amount", lastVerifiedAmount > 0 ? lastVerifiedAmount : targetOrder.total);
            body.put("payerName", lastVerifiedPayer);
            body.put("receiverName", lastVerifiedReceiver);
            body.put("manualConfirmed", true);

            final String requestBodyStr = body.toString();

            List<String> endpoints = new ArrayList<>();
            if (activePosUrl != null && !activePosUrl.trim().isEmpty()) {
                endpoints.add(activePosUrl.trim().replaceAll("/+$", ""));
            }
            if (!endpoints.contains(DEFAULT_LOCAL_URL)) {
                endpoints.add(DEFAULT_LOCAL_URL);
            }
            if (!endpoints.contains(DEFAULT_TUNNEL_URL)) {
                endpoints.add(DEFAULT_TUNNEL_URL);
            }

            tryLinkOrderEndpoints(endpoints, 0, targetOrder, requestBodyStr, apiKey);

        } catch (Exception e) {
            isLinkingInFlight = false;
            mainHandler.post(this::hideLoading);
        }
    }

    private void tryLinkOrderEndpoints(
            final List<String> endpoints,
            final int index,
            final OpenOrder targetOrder,
            final String requestBodyStr,
            final String apiKey
    ) {
        if (index >= endpoints.size()) {
            isLinkingInFlight = false;
            mainHandler.post(() -> {
                hideLoading();
                Toast.makeText(MainActivity.this, "Network error: Could not reach Cashier PC to link order", Toast.LENGTH_SHORT).show();
            });
            return;
        }

        final String currentBaseUrl = endpoints.get(index);
        RequestBody requestBody = RequestBody.Companion.create(
                requestBodyStr,
                MediaType.Companion.parse("application/json; charset=utf-8")
        );

        Request request = new Request.Builder()
                .url(currentBaseUrl + "/api/scanner/verify-order")
                .header("x-scanner-token", apiKey)
                .post(requestBody)
                .build();

        httpClient.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(@NonNull Call call, @NonNull IOException e) {
                tryLinkOrderEndpoints(endpoints, index + 1, targetOrder, requestBodyStr, apiKey);
            }

            @Override
            public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                final String jsonStr = response.body() != null ? response.body().string() : "{}";
                final int statusCode = response.code();

                if (response.isSuccessful()) {
                    activePosUrl = currentBaseUrl;
                    mainHandler.post(() -> {
                        isLinkingInFlight = false;
                        hideLoading();
                        try {
                            JSONObject res = new JSONObject(jsonStr);
                            if (res.optBoolean("success", false)) {
                                playBeep(true);
                                vibrateSuccess();
                                txtResultPosMatch.setText(String.format(Locale.US, "✅ Linked to %s (Marked Paid on Cashier PC!)", targetOrder.displayTitle));
                                layoutPostScanTablePicker.setVisibility(View.GONE);
                                clearSelectedOrder();
                                fetchOpenOrders(false);
                                updateHistoryLinked(lastVerifiedRef, targetOrder.displayTitle);
                                Toast.makeText(MainActivity.this, "✅ Marked Paid on Cashier PC for " + targetOrder.displayTitle, Toast.LENGTH_SHORT).show();
                            } else {
                                handleLinkOrderError(res, statusCode);
                            }
                        } catch (Exception ex) {
                            Toast.makeText(MainActivity.this, "Error parsing link response: " + ex.getMessage(), Toast.LENGTH_SHORT).show();
                        }
                    });
                } else if (statusCode >= 500) {
                    tryLinkOrderEndpoints(endpoints, index + 1, targetOrder, requestBodyStr, apiKey);
                } else {
                    // Authoritative 4xx response
                    mainHandler.post(() -> {
                        isLinkingInFlight = false;
                        hideLoading();
                        try {
                            JSONObject res = new JSONObject(jsonStr);
                            handleLinkOrderError(res, statusCode);
                        } catch (Exception ex) {
                            txtResultPosMatch.setText("⚠️ Failed to link order (HTTP " + statusCode + ")");
                            Toast.makeText(MainActivity.this, "⚠️ Failed to link order (HTTP " + statusCode + ")", Toast.LENGTH_LONG).show();
                        }
                    });
                }
            }
        });
    }

    private void handleLinkOrderError(JSONObject res, int statusCode) {
        boolean isDuplicate = res.optBoolean("duplicate", false) || res.optBoolean("isDuplicate", false);
        final String err = res.optString("error", "Failed to link order (HTTP " + statusCode + ")");
        if (isDuplicate) {
            applyDuplicateAlertStyle(err.isEmpty() ? "🚨 This receipt was already used on another order!" : err);
            Toast.makeText(MainActivity.this, "🚨 DUPLICATE: " + err, Toast.LENGTH_LONG).show();
            return;
        }
        txtResultPosMatch.setText(err);
        playBeep(false);
        vibrateError();
        Toast.makeText(MainActivity.this, "⚠️ " + err, Toast.LENGTH_LONG).show();
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
            String statusTitle,
            String slipUrl,
            String posMatchMessage
    ) {
        mainHandler.post(() -> {
            hideLoading();
            isVerifying = false;

            cardResult.setAlpha(0f);
            cardResult.setScaleX(0.9f);
            cardResult.setScaleY(0.9f);
            cardResult.setVisibility(View.VISIBLE);
            cardResult.animate()
                    .alpha(1f)
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(260)
                    .setInterpolator(new android.view.animation.OvershootInterpolator(1.15f))
                    .start();

            if (isSuccess) {
                resetCardToDefaultStyle();
                playBeep(true);
                vibrateSuccess();

                if (btnRetryVerification != null) {
                    btnRetryVerification.setVisibility(View.GONE);
                }

                imgResultIcon.setImageResource(R.drawable.ic_verified_check);
                txtResultStatus.setText(statusTitle != null ? statusTitle : getString(R.string.verified_title));
                txtResultStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_green));

                txtResultBadge.setText(getString(R.string.badge_genuine));
                txtResultBadge.setBackgroundResource(R.drawable.badge_status_green);
                txtResultBadge.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_green));

                txtResultAmount.setText(String.format(Locale.US, "%.2f ETB", amount));
                txtResultPayer.setText(payer);
                txtResultReceiver.setText(receiver);
                txtResultRef.setText(reference);
                txtResultDate.setText(dateTime);
                txtResultPosMatch.setText(posMatchMessage);

                saveToHistory(reference, provider, amount, payer, dateTime, true);
            } else {
                playBeep(false);
                vibrateError();

                if (btnRetryVerification != null) {
                    btnRetryVerification.setVisibility(View.VISIBLE);
                }

                // Bug C: Clear verified fields and hide table picker on failure so table taps cannot link stale slip
                lastVerifiedRef = "";
                lastVerifiedProvider = "";
                lastVerifiedAmount = 0.0;
                lastVerifiedPayer = "";
                lastVerifiedReceiver = "";
                if (layoutPostScanTablePicker != null) {
                    layoutPostScanTablePicker.setVisibility(View.GONE);
                }

                imgResultIcon.setImageResource(R.drawable.ic_error_cross);
                txtResultStatus.setText(statusTitle != null ? statusTitle : getString(R.string.failed_title));
                txtResultStatus.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_red));

                txtResultBadge.setText(getString(R.string.badge_failed));
                txtResultBadge.setBackgroundResource(R.drawable.badge_status_red);
                txtResultBadge.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.status_red));

                txtResultAmount.setText(amount > 0 ? String.format(Locale.US, "%.2f ETB", amount) : "0.00 ETB");
                txtResultPayer.setText(payer);
                txtResultReceiver.setText(receiver);
                txtResultRef.setText(reference);
                txtResultDate.setText(dateTime != null ? dateTime : "-");
                txtResultPosMatch.setText(posMatchMessage);
            }

            if ("TELEBIRR".equalsIgnoreCase(provider)) {
                txtResultProvider.setText("TELEBIRR");
                txtResultProvider.setTextColor(Color.parseColor("#38BDF8"));
            } else if ("CBE".equalsIgnoreCase(provider)) {
                txtResultProvider.setText("COMMERCIAL BANK OF ETHIOPIA");
                txtResultProvider.setTextColor(Color.parseColor("#A855F7"));
            } else {
                txtResultProvider.setText(provider);
                txtResultProvider.setTextColor(ContextCompat.getColor(MainActivity.this, R.color.gold));
            }

            lastVerifiedUrl = slipUrl;

            updateTodaySummary();
        });
    }

    // ══════════════════════════════════════════════════
    // 📋 ORDERS-FIRST HUB — Grid, Filters, Scanner Toggle
    // ══════════════════════════════════════════════════

    private void openScannerOverlay() {
        isScannerOpen = true;
        barcodeView.setVisibility(View.VISIBLE);
        if (ordersSection != null) ordersSection.setVisibility(View.GONE);
        if (scannerOverlay != null) scannerOverlay.setVisibility(View.VISIBLE);
        if (fabOpenScanner != null) fabOpenScanner.setVisibility(View.GONE);
        if (!isWebViewMode) barcodeView.resume();
        startLaserAnimation();
    }

    private void closeScannerOverlay() {
        isScannerOpen = false;
        if (!isWebViewMode) barcodeView.pause();
        barcodeView.setVisibility(View.GONE);
        if (laserLine != null) laserLine.clearAnimation();
        if (scannerOverlay != null) scannerOverlay.setVisibility(View.GONE);
        if (ordersSection != null) ordersSection.setVisibility(View.VISIBLE);
        if (fabOpenScanner != null) fabOpenScanner.setVisibility(View.VISIBLE);
    }

    private void setActiveFilter(String filter) {
        activeFilter = filter;
        updateChipSelection();
        refreshOrderGrid();
    }

    private void updateChipSelection() {
        if (chipAll == null) return;
        boolean isAll = "ALL".equals(activeFilter);
        boolean isTable = "TABLE".equals(activeFilter);
        boolean isDelivery = "DELIVERY".equals(activeFilter);
        chipAll.setBackgroundResource(isAll ? R.drawable.bg_order_chip_selected : R.drawable.bg_order_chip);
        chipAll.setTextColor(ContextCompat.getColor(this, isAll ? R.color.gold : R.color.text_secondary));
        chipTables.setBackgroundResource(isTable ? R.drawable.bg_order_chip_selected : R.drawable.bg_order_chip);
        chipTables.setTextColor(ContextCompat.getColor(this, isTable ? R.color.gold : R.color.text_secondary));
        chipDelivery.setBackgroundResource(isDelivery ? R.drawable.bg_order_chip_selected : R.drawable.bg_order_chip);
        chipDelivery.setTextColor(ContextCompat.getColor(this, isDelivery ? R.color.gold : R.color.text_secondary));
    }

    private void updateChipCounts() {
        if (chipAll == null) return;
        int tableCount = 0, deliveryCount = 0;
        for (OpenOrder o : currentOpenOrders) {
            if (o.isDelivery || o.isTakeaway) deliveryCount++;
            else tableCount++;
        }
        chipAll.setText(getString(R.string.filter_all) + " (" + currentOpenOrders.size() + ")");
        chipTables.setText(getString(R.string.filter_tables) + " (" + tableCount + ")");
        chipDelivery.setText(getString(R.string.filter_delivery) + " (" + deliveryCount + ")");
    }

    private void refreshOrderGrid() {
        renderOrderGrid(getFilteredSortedOrders());
    }

    private List<OpenOrder> getFilteredSortedOrders() {
        List<OpenOrder> tables = new ArrayList<>();
        List<OpenOrder> deliveries = new ArrayList<>();

        for (OpenOrder o : currentOpenOrders) {
            if (o.isDelivery || o.isTakeaway) deliveries.add(o);
            else tables.add(o);
        }

        // Sort dine-in tables numerically
        Collections.sort(tables, (a, b) -> Integer.compare(extractTableNumber(a.displayTitle), extractTableNumber(b.displayTitle)));
        // Sort delivery/takeaway alphabetically
        Collections.sort(deliveries, (a, b) -> a.displayTitle.compareToIgnoreCase(b.displayTitle));

        List<OpenOrder> result = new ArrayList<>();
        if ("ALL".equals(activeFilter)) {
            result.addAll(tables);
            result.addAll(deliveries);
        } else if ("TABLE".equals(activeFilter)) {
            result.addAll(tables);
        } else {
            result.addAll(deliveries);
        }
        return result;
    }

    private int extractTableNumber(String title) {
        Matcher m = Pattern.compile("\\d+").matcher(title);
        if (m.find()) {
            try { return Integer.parseInt(m.group()); } catch (Exception ignored) {}
        }
        return 999;
    }

    private void renderOrderGrid(List<OpenOrder> orders) {
        if (layoutOrdersList == null) return;
        layoutOrdersList.removeAllViews();

        if (orders.isEmpty()) {
            txtNoOrdersNotice.setVisibility(View.VISIBLE);
            return;
        }
        txtNoOrdersNotice.setVisibility(View.GONE);

        LayoutInflater inflater = LayoutInflater.from(this);
        int marginPx = dpToPx(4);

        for (int i = 0; i < orders.size(); i += 2) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            rowParams.setMargins(0, 0, 0, marginPx);
            row.setLayoutParams(rowParams);

            addCardToRow(row, orders.get(i), inflater);

            if (i + 1 < orders.size()) {
                addCardToRow(row, orders.get(i + 1), inflater);
            } else {
                // Empty spacer to keep first card half-width
                View spacer = new View(this);
                spacer.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f));
                row.addView(spacer);
            }

            layoutOrdersList.addView(row);
        }
    }

    private void addCardToRow(LinearLayout row, OpenOrder order, LayoutInflater inflater) {
        View card = inflater.inflate(R.layout.item_open_order, row, false);

        TextView txtTitle = card.findViewById(R.id.txtOrderTitle);
        TextView txtTotal = card.findViewById(R.id.txtOrderTotal);
        TextView txtCount = card.findViewById(R.id.txtOrderItemsCount);
        TextView txtVerifiedBadge = card.findViewById(R.id.txtOrderVerifiedBadge);
        TextView txtTypeBadge = card.findViewById(R.id.txtOrderTypeBadge);

        txtTitle.setText(order.displayTitle);
        txtTotal.setText(String.format(Locale.US, "%.2f ETB", order.total));
        txtCount.setText(order.itemsCount == 1
                ? getString(R.string.order_items_count_single)
                : getString(R.string.order_items_count_multiple, order.itemsCount));
        txtVerifiedBadge.setVisibility(order.isVerified ? View.VISIBLE : View.GONE);

        if (txtTypeBadge != null) {
            if (order.isDelivery) {
                txtTypeBadge.setText("🛵 DELIVERY");
                txtTypeBadge.setTextColor(ContextCompat.getColor(this, R.color.delivery_blue));
            } else if (order.isTakeaway) {
                txtTypeBadge.setText("📦 TAKEAWAY");
                txtTypeBadge.setTextColor(ContextCompat.getColor(this, R.color.text_secondary));
            } else {
                txtTypeBadge.setText("🍽 TABLE");
                txtTypeBadge.setTextColor(ContextCompat.getColor(this, R.color.gold));
            }
        }

        card.setBackgroundResource(selectedOrder != null && selectedOrder.id.equals(order.id)
                ? R.drawable.bg_order_chip_selected : R.drawable.bg_order_chip);

        card.setOnClickListener(v -> toggleOrderSelection(order));
        row.addView(card);
    }

    private int dpToPx(int dp) {
        return Math.round(dp * getResources().getDisplayMetrics().density);
    }

    private void resetScannerToActive() {
        mainHandler.post(() -> {
            isCurrentResultDuplicate = false;
            resetCardToDefaultStyle();
            cardResult.setVisibility(View.GONE);
            layoutPostScanTablePicker.setVisibility(View.GONE);
            if (btnRetryVerification != null) btnRetryVerification.setVisibility(View.GONE);
            lastVerifiedRef = "";
            lastVerifiedProvider = "";
            lastVerifiedAmount = 0.0;
            lastVerifiedPayer = "";
            lastVerifiedReceiver = "";
            hideLoading();
            isVerifying = false;
            // Resume scanning if scanner overlay is still open
            if (isScannerOpen && !isWebViewMode) barcodeView.resume();
            fetchOpenOrders(false);
        });
    }

    private void showLoading(final String message) {
        mainHandler.post(() -> {
            txtLoadingMsg.setText(message);
            loadingOverlay.setVisibility(View.VISIBLE);
        });
    }

    private void hideLoading() {
        mainHandler.post(() -> loadingOverlay.setVisibility(View.GONE));
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
        RadioGroup radioGroup = dialogView.findViewById(R.id.radioProvider);
        Button btnVerify = dialogView.findViewById(R.id.btnVerifyManual);
        Button btnCancel = dialogView.findViewById(R.id.btnCancelManual);

        btnVerify.setOnClickListener(v -> {
            String code = inputCode.getText().toString().trim();
            if (code.isEmpty()) {
                inputCode.setError("Enter code or paste slip link");
                return;
            }

            int selectedRadio = radioGroup.getCheckedRadioButtonId();
            String prov = "AUTO";
            if (selectedRadio == R.id.radioTelebirr) prov = "TELEBIRR";
            else if (selectedRadio == R.id.radioCbe) prov = "CBE";

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
        Button btnPresetTunnel = dialogView.findViewById(R.id.btnPresetTunnel);
        Button btnPresetLocal = dialogView.findViewById(R.id.btnPresetLocal);
        Button btnSave = dialogView.findViewById(R.id.btnSaveSettings);
        Button btnTest = dialogView.findViewById(R.id.btnTestSettings);
        Button btnClose = dialogView.findViewById(R.id.btnCloseSettings);

        inputPosUrl.setText(prefs.getString(KEY_POS_URL, activePosUrl));
        inputApiKey.setText(prefs.getString(KEY_API_KEY, DEFAULT_API_KEY));

        btnPresetTunnel.setOnClickListener(v -> inputPosUrl.setText(DEFAULT_TUNNEL_URL));
        btnPresetLocal.setOnClickListener(v -> inputPosUrl.setText(DEFAULT_LOCAL_URL));

        btnTest.setOnClickListener(v -> {
            String testUrl = inputPosUrl.getText().toString().trim().replaceAll("/+$", "");
            String key = inputApiKey.getText().toString().trim();
            btnTest.setText("Testing Connection...");

            Request req = new Request.Builder()
                    .url(testUrl + "/api/scanner/orders?key=" + key)
                    .header("x-scanner-token", key)
                    .build();

            httpClient.newCall(req).enqueue(new Callback() {
                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    mainHandler.post(() -> {
                        btnTest.setText("Connection Failed");
                        Toast.makeText(MainActivity.this, "Cannot connect: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                    });
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    if (response.isSuccessful()) {
                        String body = response.body() != null ? response.body().string() : "{}";
                        mainHandler.post(() -> {
                            btnTest.setText("Connected (OK)");
                            Toast.makeText(MainActivity.this, "Cashier PC connected! Open orders retrieved.", Toast.LENGTH_SHORT).show();
                            parseAndRenderOrders(body);
                        });
                    } else {
                        mainHandler.post(() -> {
                            btnTest.setText("HTTP " + response.code());
                            Toast.makeText(MainActivity.this, "Server responded with error " + response.code(), Toast.LENGTH_SHORT).show();
                        });
                    }
                }
            });
        });

        btnSave.setOnClickListener(v -> {
            String newUrl = inputPosUrl.getText().toString().trim();
            String newKey = inputApiKey.getText().toString().trim();
            prefs.edit()
                    .putString(KEY_POS_URL, newUrl)
                    .putString(KEY_API_KEY, newKey)
                    .apply();
            activePosUrl = newUrl;
            dialog.dismiss();
            discoverAndConnectCashierPc(true);
            Toast.makeText(this, "Settings saved. Connecting...", Toast.LENGTH_SHORT).show();
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
                String linkedTitle = item.optString("linkedOrderTitle", "");
                boolean isLinked = !linkedTitle.isEmpty();
                boolean success = item.optBoolean("success", true);
                boolean canRestore = success && !isLinked;

                // Card container
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                int dp8 = Math.round(8f * getResources().getDisplayMetrics().density);
                int dp12 = Math.round(12f * getResources().getDisplayMetrics().density);
                int dp6 = Math.round(6f * getResources().getDisplayMetrics().density);
                card.setPadding(dp12, dp8, dp12, dp8);
                card.setBackgroundResource(isLinked ? R.drawable.badge_status_green : (canRestore ? R.drawable.bg_order_chip : R.drawable.badge_status_red));
                if (canRestore) {
                    card.setClickable(true);
                    card.setFocusable(true);
                    final int idx = i;
                    card.setOnClickListener(v -> {
                        // Restore scan context so user can link
                        lastVerifiedRef = item.optString("reference", "");
                        lastVerifiedProvider = item.optString("provider", "");
                        lastVerifiedAmount = amt;
                        lastVerifiedPayer = item.optString("payer", "");
                        dialog.dismiss();
                        // Show the scanner overlay result + table picker
                        if (scannerOverlay != null) scannerOverlay.setVisibility(View.VISIBLE);
                        if (ordersSection != null) ordersSection.setVisibility(View.GONE);
                        if (layoutPostScanTablePicker != null && !currentOpenOrders.isEmpty()) {
                            layoutPostScanTablePicker.setVisibility(View.VISIBLE);
                            populatePostScanTableButtons();
                        }
                    });
                }

                // Main line: payer | amount
                LinearLayout row1 = new LinearLayout(this);
                row1.setOrientation(LinearLayout.HORIZONTAL);
                TextView tvPayer = new TextView(this);
                tvPayer.setText(item.optString("payer", item.optString("reference", "?")));
                tvPayer.setTextColor(ContextCompat.getColor(this, R.color.text_primary));
                tvPayer.setTextSize(13f);
                tvPayer.setTypeface(null, Typeface.BOLD);
                LinearLayout.LayoutParams lp1 = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
                tvPayer.setLayoutParams(lp1);
                TextView tvAmt = new TextView(this);
                tvAmt.setText(String.format(Locale.US, "%.2f ETB", amt));
                tvAmt.setTextColor(ContextCompat.getColor(this, isLinked ? R.color.status_green : R.color.gold));
                tvAmt.setTextSize(13f);
                tvAmt.setTypeface(null, Typeface.BOLD);
                row1.addView(tvPayer);
                row1.addView(tvAmt);
                card.addView(row1);

                // Sub-line: provider · time
                TextView tvSub = new TextView(this);
                tvSub.setText(item.optString("provider", "") + " · " + item.optString("time", ""));
                tvSub.setTextColor(ContextCompat.getColor(this, R.color.text_secondary));
                tvSub.setTextSize(11f);
                card.addView(tvSub);

                // Status line
                if (isLinked) {
                    TextView tvLinked = new TextView(this);
                    tvLinked.setText("✓ Linked → " + linkedTitle);
                    tvLinked.setTextColor(ContextCompat.getColor(this, R.color.status_green));
                    tvLinked.setTextSize(11f);
                    tvLinked.setTypeface(null, Typeface.BOLD);
                    card.addView(tvLinked);
                } else if (canRestore) {
                    TextView tvTap = new TextView(this);
                    tvTap.setText("Tap to link to an order →");
                    tvTap.setTextColor(ContextCompat.getColor(this, R.color.gold));
                    tvTap.setTextSize(11f);
                    card.addView(tvTap);
                }

                LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                cardLp.setMargins(0, 0, 0, dp8);
                card.setLayoutParams(cardLp);
                listContainer.addView(card);
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
            item.put("linkedOrderTitle", "");

            arr.put(item);
            prefs.edit().putString(KEY_HISTORY, arr.toString()).apply();
        } catch (Exception ignored) {}
    }

    private void updateHistoryLinked(String ref, String orderTitle) {
        try {
            String historyJson = prefs.getString(KEY_HISTORY, "[]");
            JSONArray arr = new JSONArray(historyJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.getJSONObject(i);
                if (ref.equals(item.optString("reference"))) {
                    item.put("linkedOrderTitle", orderTitle);
                    arr.put(i, item);
                    break;
                }
            }
            prefs.edit().putString(KEY_HISTORY, arr.toString()).apply();
            updateTodaySummary();
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
            txtTodaySummary.setText(getString(R.string.today_summary_format, arr.length(), String.format(Locale.US, "%.2f ETB", total)));
        } catch (Exception ignored) {}
    }

    // ==========================================
    // 🛠️ HELPERS & REGEX
    // ==========================================

    private String extractTelebirrId(String raw) {
        return detectPayment(raw).reference;
    }

    private String extractHtmlField(String html, String fieldRegex) {
        return ReceiptParser.extractHtmlField(html, fieldRegex);
    }

    private double parseDoubleSafe(String val) {
        return ReceiptParser.parseDoubleSafe(val);
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
