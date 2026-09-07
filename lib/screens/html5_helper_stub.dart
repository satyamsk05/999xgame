import 'dart:async';
import 'package:flutter/material.dart';

void registerIframeViewFactory(String viewId, String gameUrl) {}

Widget buildPlatformIframe(String viewId) {
  return const Center(
    child: Text(
      'HTML5 Games require Web environment',
      style: TextStyle(color: Colors.white70),
    ),
  );
}

StreamSubscription? setupWebMessageListener(void Function(String message) onMessage) => null;

void openAuth0UniversalLogin(String serverDomain) {}
