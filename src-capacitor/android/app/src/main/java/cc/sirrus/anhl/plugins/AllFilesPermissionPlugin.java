package cc.sirrus.anhl.plugins;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AllFilesPermission")
public class AllFilesPermissionPlugin extends Plugin {

  public void check(PluginCall call) {
    JSObject ret = new JSObject();
    boolean granted = false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      granted = Environment.isExternalStorageManager();
    } else {
      // On older versions, READ/WRITE_EXTERNAL_STORAGE runtime permissions cover broad access
      granted = true;
    }
    ret.put("granted", granted);
    call.resolve(ret);
  }

  public void request(PluginCall call) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      try {
        Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      } catch (Exception e) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      }
    }
    JSObject ret = new JSObject();
    ret.put("requested", true);
    call.resolve(ret);
  }
}

