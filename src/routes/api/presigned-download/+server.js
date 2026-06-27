import { json } from '@sveltejs/kit';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client } from '$lib/r2-server';
import { R2_BUCKET_NAME } from '$env/static/private';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const supabaseAdmin = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

export async function POST({ request, locals }) {
  const session = await locals.getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { key } = await request.json();
  if (!key) return json({ error: 'Missing key' }, { status: 400 });

  const { data: fileData, error: fileError } = await supabaseAdmin
    .from('files')
    .select('id, user_id')
    .eq('storage_path', key)
    .single();

  if (fileError || !fileData) {
    return json({ error: 'File not found' }, { status: 404 });
  }

  const userId = session.user.id;
  if (fileData.user_id !== userId) {
    const { data: shareData } = await supabaseAdmin
      .from('shares')
      .select('id')
      .eq('file_id', fileData.id)
      .eq('shared_with', userId)
      .single();
    if (!shareData) {
      return json({ error: 'Access denied' }, { status: 403 });
    }
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn: 60 * 60 * 24 * 7 });
  return json({ url });
}
