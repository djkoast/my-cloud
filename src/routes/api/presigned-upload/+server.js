import { json } from '@sveltejs/kit'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { r2Client } from '$lib/r2-server'
import { R2_BUCKET_NAME } from '$env/static/private'

export async function POST({ request, locals }) {
  const session = await locals.getSession()
  if (!session) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { fileName, contentType } = await request.json()
  if (!fileName || !contentType) {
    return json({ error: 'Missing fileName or contentType' }, { status: 400 })
  }

  const userFolder = session.user.id
  const key = `${userFolder}/${Date.now()}-${fileName}`

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(r2Client, command, { expiresIn: 300 })
  return json({ url, key })
}
