import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Send OTP via Supabase Auth SMS
 */
export async function sendOTPWithSupabase(phone: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Format phone number for Supabase (should include country code)
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    
    console.log('Sending OTP via Supabase:', { phone: formattedPhone });

    const { error } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
    });

    if (error) {
      console.error('Supabase SMS Error:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to send OTP via Supabase' 
      };
    }

    console.log('OTP sent successfully via Supabase');
    return { success: true };

  } catch (error) {
    console.error('Supabase Service Error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Verify OTP via Supabase Auth
 */
export async function verifyOTPWithSupabase(phone: string, otp: string): Promise<{ success: boolean; session?: any; message?: string }> {
  try {
    const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;
    
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formattedPhone,
      token: otp,
      type: 'sms',
    });

    if (error) {
      console.error('Supabase Verify Error:', error);
      return { 
        success: false, 
        message: error.message || 'Failed to verify OTP' 
      };
    }

    console.log('OTP verified successfully via Supabase');
    return { success: true, session: data.session };

  } catch (error) {
    console.error('Supabase Verify Service Error:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
