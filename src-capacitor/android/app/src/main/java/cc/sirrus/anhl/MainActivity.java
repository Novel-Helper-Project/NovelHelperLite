package cc.sirrus.anhl;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import cc.sirrus.anhl.plugins.AllFilesPermissionPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(AllFilesPermissionPlugin.class);
  }
}
