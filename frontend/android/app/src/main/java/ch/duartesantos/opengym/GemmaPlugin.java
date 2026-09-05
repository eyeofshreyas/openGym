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
import java.util.concurrent.atomic.AtomicBoolean;

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
    // A second pickModel() while one is already outstanding would overwrite the bridge's
    // saved PluginCall for the first with the second, orphaning that first call — its JS
    // promise would never resolve or reject. Guard so a double-tap fails the second call
    // fast instead of silently hanging the first.
    private final AtomicBoolean picking = new AtomicBoolean(false);

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
        if (!picking.compareAndSet(false, true)) {
            call.reject("pick already in progress");
            return;
        }
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(call, i, "modelPicked");
    }

    @ActivityCallback
    private void modelPicked(PluginCall call, ActivityResult result) {
        if (call == null) {
            picking.set(false);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            picking.set(false);
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
            } finally {
                picking.set(false);
            }
        });
    }

    @PluginMethod
    public void removeModel(PluginCall call) {
        modelFile().delete();
        call.resolve(statusObject());
    }
}
