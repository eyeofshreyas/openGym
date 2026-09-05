package ch.duartesantos.opengym;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * On-device Gemma for the plan builder.
 *
 * The model file is picked and copied here rather than in JS: it is ~2 GB, and
 * @capacitor/filesystem moves file contents as base64 across the WebView bridge, which
 * would exhaust the heap long before the copy finished.
 */
@CapacitorPlugin(name = "Gemma")
public class GemmaPlugin extends Plugin {

    private static final String MODEL_NAME = "gemma-model.task";
    private final ExecutorService pool = Executors.newSingleThreadExecutor();

    private File modelFile() {
        return new File(getContext().getFilesDir(), MODEL_NAME);
    }

    private JSObject statusObject() {
        File f = modelFile();
        boolean ok = f.exists() && f.length() > 0;
        JSObject r = new JSObject();
        r.put("installed", ok);
        r.put("bytes", ok ? f.length() : 0);
        return r;
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObject());
    }

    @PluginMethod
    public void pickModel(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "modelPicked");
    }

    @ActivityCallback
    private void modelPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            call.reject("cancelled");
            return;
        }
        // Streamed in 1 MB blocks on a background thread — a couple of gigabytes must
        // never touch the main thread or the bridge.
        pool.execute(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri);
                 OutputStream out = new FileOutputStream(modelFile())) {
                if (in == null) throw new IllegalStateException("cannot open file");
                byte[] buf = new byte[1 << 20];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                call.resolve(statusObject());
            } catch (Exception e) {
                modelFile().delete();   // a half-copied model is worse than none
                call.reject(e.getMessage() == null ? "copy failed" : e.getMessage());
            }
        });
    }

    @PluginMethod
    public void removeModel(PluginCall call) {
        modelFile().delete();
        call.resolve(statusObject());
    }
}
