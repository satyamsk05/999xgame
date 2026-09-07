import 'dart:async';
import 'dart:ui_web' as ui_web;
import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

void registerIframeViewFactory(String viewId, String gameUrl) {
  ui_web.platformViewRegistry.registerViewFactory(
    viewId,
    (int id) {
      final iframe = web.document.createElement('iframe') as web.HTMLIFrameElement;
      iframe.src = gameUrl;
      iframe.style.border = 'none';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      return iframe;
    },
  );
}

Widget buildPlatformIframe(String viewId) {
  return HtmlElementView(viewType: viewId);
}

StreamSubscription? setupWebMessageListener(void Function(String message) onMessage) {
  return web.window.onMessage.listen((event) {
    onMessage(event.data.toString());
  });
}

void openAuth0UniversalLogin(String targetUrl) {
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
    web.window.location.href = targetUrl;
  } else {
    web.window.location.href = '$targetUrl/login';
  }
}
