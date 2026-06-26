import { json } from '@sveltejs/kit'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client } from '$lib/r2-server'
import { R2_BUCKET_NAME } from '$env/static/private'

export async function POST({ request, locals }) {
  const session = await locals.getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { key } = await request.json()
  if (!key) {
    return json({ error: 'Missing key' }, { status: 400 })
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  })

  const url = await getSignedUrl(r2Client, command, { expiresIn: 60 * 60 * 24 * 7 })
  return json({ url })
}
