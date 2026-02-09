package com.godgodgame.seedclaw

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // Handle WindowInsets for keyboard
    val decorView = window.decorView
    ViewCompat.setOnApplyWindowInsetsListener(decorView) { view, insets ->
      val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      
      // Apply padding: use keyboard height if visible, otherwise system bars
      view.setPadding(
        systemBars.left,
        systemBars.top,
        systemBars.right,
        max(systemBars.bottom, ime.bottom)
      )
      
      WindowInsetsCompat.CONSUMED
    }

    // Start the Foreground Service to keep app alive
    val serviceIntent = android.content.Intent(this, GotifyService::class.java)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        startForegroundService(serviceIntent)
    } else {
        startService(serviceIntent)
    }
  }
}
