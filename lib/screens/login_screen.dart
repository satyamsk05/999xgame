import 'dart:async';
import 'dart:ui' as ui;
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api/api_client.dart';
import '../core/storage/token_manager.dart';
import '../features/auth/data/auth_api.dart';
import '../services/api_service.dart';

// NOTE: remainder of file unchanged; only remove nullable operator from statusCode
