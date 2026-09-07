import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static const String supabaseUrl = 'https://kviraeucemnbinfnncoc.supabase.co';
  static const String supabaseAnonKey = 'sb_publishable_2lDQeXxwFaTrcaL70caWgg_mk_mj-RA';

  static SupabaseClient get client => Supabase.instance.client;

  static Future<void> initialize() async {
    try {
      await Supabase.initialize(
        url: supabaseUrl,
        publishableKey: supabaseAnonKey,
        authOptions: const FlutterAuthClientOptions(
          authFlowType: AuthFlowType.pkce,
        ),
      );
      if (kDebugMode) {
        print('✅ Supabase initialized successfully!');
      }
    } catch (e) {
      if (kDebugMode) {
        print('⚠️ Supabase init warning: $e');
      }
    }
  }

  // Supabase Google OAuth Sign-In
  static Future<bool> signInWithGoogle() async {
    try {
      return await client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: kIsWeb ? null : 'ingames://auth-callback',
      );
    } catch (e) {
      if (kDebugMode) {
        print('Supabase Google OAuth Error: $e');
      }
      return false;
    }
  }

  // Supabase Guest / Anonymous Auth
  static Future<AuthResponse> signInAnonymously() async {
    return await client.auth.signInAnonymously();
  }

  // Current authenticated user session
  static User? get currentUser => client.auth.currentUser;
  static String? get currentUserId => client.auth.currentUser?.id;

  // Sign Out
  static Future<void> signOut() async {
    await client.auth.signOut();
  }
}
