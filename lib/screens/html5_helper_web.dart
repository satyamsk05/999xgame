import 'dart:ui_web' as ui_web;
import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

void registerIframeViewFactory(String viewId, String gameUrl) {
  ui_web.platformViewRegistry.registerViewFactory(
    viewId,
    (int id) {
      final iframe = web.document.createElement('iframe') as web.HTMLIFrameElement;
      const serverDomain = String.fromEnvironment(
        'SERVER_DOMAIN',
        defaultValue: 'http://localhost:5050',
      );
      iframe.src = '$serverDomain$gameUrl';
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

void setupWebMessageListener(void Function(String message) onMessage) {
  web.window.onMessage.listen((event) {
    onMessage(event.data.toString());
  });
}

void openAuth0UniversalLogin(String serverDomain) {
  web.window.location.href = '$serverDomain/login';
}

void openExternalUrl(String url) {
  web.window.open(url, '_blank');
}
