package fi.junction.afferent;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // In-app plugins must be registered before super.onCreate: that call builds the bridge
        // and exports the plugin list to the web view. The list lives in AfferentPlugins.kt.
        registerPlugins(AfferentPlugins.all);
        super.onCreate(savedInstanceState);
    }
}
