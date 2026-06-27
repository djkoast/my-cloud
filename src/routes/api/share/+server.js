import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST({ request, locals }) {
  const session = await locals.getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { fileId, email } = await request.json();
  if (!fileId || !email) {
    return json({ error: 'Missing fileId or email' }, { status: 400 });
  }

  const { data: profiles, error: lookupError } = await supabaseAdmin
    .from('auth.users')
    .select('id')
    .eq('email', email)
    .single();

  if (lookupError || !profiles) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  const recipientId = profiles.id;

  const { error: insertError } = await supabaseAdmin
    .from('shares')
    .insert({
      file_id: fileId,
      owner_id: session.user.id,
      shared_with: recipientId,
    });

  if (insertError) {
    return json({ error: insertError.message }, { status: 500 });
  }

  return json({ success: true });
}
