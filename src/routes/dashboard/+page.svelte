<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import { Loader2, FolderPlus, UploadCloud, Trash2, Share2, Pencil, Search, Sun, Moon, LogOut, History, File, Folder, Image, Video, FileText, ChevronRight, X, Link2, Plus } from 'lucide-svelte'

  let files = $state([])
  let sharedFiles = $state([])
  let folder = $state('/')
  let uploading = $state(false)
  let loading = $state(true)
  let userID = $state(null)
  let dragOver = $state(false)
  let selectedFiles = $state(new Set())
  let previewFile = $state(null)
  let renameFileId = $state(null)
  let renameText = $state('')
  let tab = $state('myfiles')
  let shareEmail = $state('')
  let shareFileId = $state(null)
  let showShareModal = $state(false)
  let searchQuery = $state('')
  let thumbnails = $state({})
  let showVersionsModal = $state(false)
  let versionsList = $state([])
  let versionsFileName = $state('')

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { goto('/login'); return }
    userID = session.user.id
    await loadMyFiles()
    await loadSharedFiles()
    loading = false
  })

  async function loadThumbnails(fileList) {
    for (let file of fileList) {
      if (file.mime_type?.startsWith('image/') && file.storage_path) {
        if (!thumbnails[file.id]) {
          try {
            const res = await fetch('/api/presigned-download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: file.storage_path }),
            })
            const data = await res.json()
            if (data.url) {
              thumbnails[file.id] = data.url
              thumbnails = thumbnails
            }
          } catch (e) {}
        }
      }
    }
  }

  async function loadMyFiles() {
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('user_id', userID)
      .eq('folder', folder)
      .order('created_at', { ascending: false })
    if (!error) {
      files = data
      loadThumbnails(data)
    }
  }

  async function loadSharedFiles() {
    const { data: shares, error } = await supabase
      .from('shares')
      .select('file_id')
      .eq('shared_with', userID)
    if (!error && shares.length > 0) {
      const fileIds = shares.map(s => s.file_id)
      const { data: filesData } = await supabase
        .from('files')
        .select('*')
        .in('id', fileIds)
        .order('created_at', { ascending: false })
      sharedFiles = filesData || []
      if (filesData) loadThumbnails(filesData)
    } else {
      sharedFiles = []
    }
  }

  async function uploadFiles(e) {
    const fileList = e.target.files
    if (!fileList.length) return
    uploading = true
    for (const file of fileList) {
      try {
        const presignedRes = await fetch('/api/presigned-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        })
        const { url, key } = await presignedRes.json()
        if (!url) throw new Error('Failed to get upload URL')

        const uploadRes = await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        })
        if (!uploadRes.ok) throw new Error('Upload to R2 failed')

        const { data: existingFiles } = await supabase
          .from('files')
          .select('id')
          .eq('user_id', userID)
          .eq('folder', folder)
          .eq('name', file.name)
          .maybeSingle()

        if (existingFiles) {
          const { data: currentFile } = await supabase
            .from('files')
            .select('*')
            .eq('id', existingFiles.id)
            .single()

          if (currentFile) {
            const { data: versions } = await supabase
              .from('file_versions')
              .select('version_number')
              .eq('file_id', existingFiles.id)
              .order('version_number', { ascending: false })
              .limit(1)

            let nextVersion = 1
            if (versions && versions.length > 0) nextVersion = versions[0].version_number + 1

            await supabase.from('file_versions').insert({
              file_id: existingFiles.id,
              version_number: nextVersion,
              size: currentFile.size,
              mime_type: currentFile.mime_type,
              storage_path: currentFile.storage_path
            })

            await supabase.from('files')
              .update({
                size: file.size,
                mime_type: file.type,
                storage_path: key
              })
              .eq('id', existingFiles.id)
          }
        } else {
          const { error: insertError } = await supabase
            .from('files')
            .insert({
              user_id: userID,
              name: file.name,
              folder: folder,
              size: file.size,
              mime_type: file.type,
              storage_path: key,
            })
          if (insertError) throw new Error('Metadata save failed: ' + insertError.message)
        }
      } catch (err) {
        alert('Upload error: ' + err.message)
      }
    }
    uploading = false
    await loadMyFiles()
  }

  async function deleteSelected() {
    const toDelete = (tab === 'myfiles' ? files : sharedFiles).filter(f => selectedFiles.has(f.id))
    for (const file of toDelete) {
      await supabase.from('files').delete().eq('id', file.id)
    }
    selectedFiles = new Set()
    if (tab === 'myfiles') await loadMyFiles()
    else await loadSharedFiles()
  }

  async function getShareLink(storagePath) {
    try {
      const res = await fetch('/api/presigned-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storagePath }),
      })
      const { url } = await res.json()
      if (!url) throw new Error('Could not get share link')
      await navigator.clipboard.writeText(url)
      alert('Link copied!')
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  async function openPreview(file) {
    if (file.mime_type.startsWith('image/') || file.mime_type.startsWith('video/') || file.mime_type === 'application/pdf') {
      try {
        const res = await fetch('/api/presigned-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: file.storage_path }),
        })
        const { url } = await res.json()
        previewFile = { name: file.name, url, type: file.mime_type }
      } catch (e) { alert('Preview error: ' + e.message) }
    } else {
      const url = await getShareLinkDirect(file.storage_path)
      window.open(url, '_blank')
    }
  }

  async function getShareLinkDirect(key) {
    const res = await fetch('/api/presigned-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    const { url } = await res.json()
    return url
  }

  function toggleSelect(fileId) {
    selectedFiles = new Set(selectedFiles.has(fileId) ? [...selectedFiles].filter(id => id !== fileId) : [...selectedFiles, fileId])
  }

  function handleDrop(e) {
    e.preventDefault()
    dragOver = false
    const dt = e.dataTransfer
    if (dt.files) { uploadFiles({ target: { files: dt.files } }) }
  }

  async function createFolder() {
    const name = prompt('Folder name:')
    if (!name) return
    const { error } = await supabase.from('files').insert({
      user_id: userID,
      name: name,
      folder: folder,
      size: 0,
      mime_type: 'folder',
      storage_path: '',
    })
    if (error) alert('Failed: ' + error.message)
    await loadMyFiles()
  }

  async function navigateToFolder(folderName) {
    folder = folder === '/' ? `/${folderName}` : `${folder}/${folderName}`
    await loadMyFiles()
  }

  async function renameFile(fileId, newName) {
    const { error } = await supabase.from('files').update({ name: newName }).eq('id', fileId)
    if (error) alert('Rename failed: ' + error.message)
    renameFileId = null
    if (tab === 'myfiles') await loadMyFiles()
    else await loadSharedFiles()
  }

  async function shareWithUser() {
    if (!shareEmail || !shareFileId) return
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: shareFileId, email: shareEmail }),
    })
    const result = await res.json()
    if (result.success) {
      alert('Shared!')
      showShareModal = false
      shareEmail = ''
      shareFileId = null
    } else {
      alert('Error: ' + (result.error || 'Failed'))
    }
  }

  async function showVersions(fileId, fileName) {
    const { data, error } = await supabase
      .from('file_versions')
      .select('*')
      .eq('file_id', fileId)
      .order('version_number', { ascending: false })
    if (error) { alert('Error: ' + error.message); return }
    versionsList = data || []
    versionsFileName = fileName
    showVersionsModal = true
  }

  async function downloadVersion(storagePath) {
    if (!storagePath) return
    const res = await fetch('/api/presigned-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: storagePath }),
    })
    const { url } = await res.json()
    if (url) window.open(url, '_blank')
  }

  async function logout() {
    await supabase.auth.signOut()
    goto('/login')
  }
</script>

<div class="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
  <!-- Top navigation bar (centered) -->
  <nav class="sticky top-0 z-10 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
    <div class="max-w-6xl mx-auto flex items-center justify-between h-16 px-4 md:px-6">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">☁️</div>
        <span class="text-lg font-semibold">MyCloud</span>
      </div>
      <div class="flex items-center gap-3">
        <button onclick={() => document.documentElement.classList.toggle('dark')} class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Toggle theme">
          <Sun class="w-5 h-5 hidden dark:block" />
          <Moon class="w-5 h-5 block dark:hidden" />
        </button>
        <button onclick={logout} class="flex items-center gap-1 px-3 py-2 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <LogOut class="w-4 h-4" />
          <span class="hidden sm:inline">Logout</span>
        </button>
      </div>
    </div>
  </nav>

  <!-- Main content: centered container -->
  <main class="flex-1 max-w-6xl w-full mx-auto px-4 md:px-6 py-8">
    
    <!-- Header area -->
    <div class="text-center mb-10">
      <h1 class="text-3xl md:text-4xl font-bold mb-2">
        {tab === 'myfiles' ? 'Files' : 'Shared with Me'}
      </h1>
      <p class="text-slate-500 dark:text-slate-400">
        {tab === 'myfiles' ? 'Manage your documents, photos, and more.' : 'Files others have shared with you.'}
      </p>
    </div>

    <!-- Toolbar: tabs, search, actions (centered) -->
    <div class="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
      <div class="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
        <button
          onclick={() => tab = 'myfiles'}
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors {tab === 'myfiles' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}"
        >
          My Files
        </button>
        <button
          onclick={() => tab = 'shared'}
          class="px-4 py-2 rounded-md text-sm font-medium transition-colors {tab === 'shared' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}"
        >
          Shared
        </button>
      </div>

      <div class="flex-1 max-w-md w-full relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search..."
          class="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400"
          bind:value={searchQuery}
        />
      </div>

      {#if tab === 'myfiles'}
        <div class="flex items-center gap-2">
          <button
            onclick={createFolder}
            class="inline-flex items-center gap-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <FolderPlus class="w-4 h-4" />
            New Folder
          </button>
          <label class="inline-flex items-center gap-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors">
            <UploadCloud class="w-4 h-4" />
            Upload
            <input type="file" multiple class="hidden" onchange={uploadFiles} />
          </label>
        </div>
      {/if}
    </div>

    <!-- Breadcrumb (my files only) -->
    {#if tab === 'myfiles'}
      <div class="flex items-center justify-center gap-1 text-sm text-slate-500 dark:text-slate-400 mb-6">
        <button onclick={() => { folder='/'; loadMyFiles() }} class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Home</button>
        {#each folder.split('/').filter(Boolean) as part, i}
          <ChevronRight class="w-4 h-4" />
          <button onclick={() => { folder = '/' + folder.split('/').slice(1, i+1).join('/'); loadMyFiles() }} class="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{part}</button>
        {/each}
      </div>
    {/if}

    <!-- Uploading indicator -->
    {#if uploading}
      <div class="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 mb-6">
        <Loader2 class="w-5 h-5 animate-spin" />
        <span class="text-sm">Uploading files...</span>
      </div>
    {/if}

    <!-- Selection actions -->
    {#if selectedFiles.size > 0}
      <div class="flex items-center justify-center gap-3 mb-6">
        <span class="text-sm text-slate-500">{selectedFiles.size} selected</span>
        <button onclick={deleteSelected} class="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
          <Trash2 class="w-4 h-4 inline mr-1" /> Delete
        </button>
      </div>
    {/if}

    <!-- File grid (centered, equally spaced) -->
    {#if loading}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {#each Array(8) as _}
          <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse">
            <div class="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-800 mb-3"></div>
            <div class="w-3/4 h-4 bg-slate-200 dark:bg-slate-800 rounded mb-2"></div>
            <div class="w-1/2 h-3 bg-slate-200 dark:bg-slate-800 rounded"></div>
          </div>
        {/each}
      </div>
    {:else if (tab === 'myfiles' && files.length === 0) || (tab === 'shared' && sharedFiles.length === 0)}
      <div class="text-center py-20">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
          <File class="w-8 h-8 text-slate-400" />
        </div>
        <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-1">No files yet</h3>
        <p class="text-slate-500 dark:text-slate-400 text-sm">
          {tab === 'myfiles' ? 'Upload your first file or create a folder.' : 'No one has shared files with you.'}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {#each (tab === 'myfiles' ? files : sharedFiles).filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) as file (file.id)}
          <div
            class="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-indigo-300 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer"
            onclick={() => file.mime_type === 'folder' ? navigateToFolder(file.name) : openPreview(file)}
            onkeydown={(e) => e.key === 'Enter' && (file.mime_type === 'folder' ? navigateToFolder(file.name) : openPreview(file))}
            role="button"
            tabindex="0"
          >
            <!-- Selection checkbox -->
            <button
              class="absolute top-3 right-3 w-6 h-6 rounded border border-slate-300 dark:border-slate-600 flex items-center justify-center opacity-0 group-hover:opacity-100 {selectedFiles.has(file.id) ? 'opacity-100 bg-indigo-600 border-indigo-600' : ''} transition-opacity"
              onclick={(e) => { e.stopPropagation(); toggleSelect(file.id) }}
            >
              {#if selectedFiles.has(file.id)}
                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              {/if}
            </button>

            <!-- Icon -->
            <div class="mb-4">
              {#if file.mime_type === 'folder'}
                <div class="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Folder class="w-5 h-5" />
                </div>
              {:else if file.mime_type?.startsWith('image/') && thumbnails[file.id]}
                <img src={thumbnails[file.id]} alt={file.name} class="w-10 h-10 rounded-lg object-cover" />
              {:else if file.mime_type?.startsWith('video/')}
                <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Video class="w-5 h-5" />
                </div>
              {:else if file.mime_type === 'application/pdf'}
                <div class="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                  <FileText class="w-5 h-5" />
                </div>
              {:else}
                <div class="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                  <File class="w-5 h-5" />
                </div>
              {/if}
            </div>

            <!-- File name & meta -->
            <h3 class="font-semibold text-sm text-slate-900 dark:text-white truncate mb-1">{file.name}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {file.mime_type === 'folder' ? 'Folder' : `${file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''}`}
              {!file.mime_type?.startsWith('folder') ? ' · ' + new Date(file.created_at).toLocaleDateString() : ''}
            </p>

            <!-- Hover actions -->
            <div class="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
              {#if tab === 'myfiles' && file.mime_type !== 'folder'}
                <button
                  onclick={(e) => { e.stopPropagation(); shareFileId = file.id; showShareModal = true }}
                  class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Share"
                >
                  <Share2 class="w-4 h-4" />
                </button>
                <button
                  onclick={(e) => { e.stopPropagation(); showVersions(file.id, file.name) }}
                  class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Versions"
                >
                  <History class="w-4 h-4" />
                </button>
              {/if}
              {#if tab === 'myfiles'}
                <button
                  onclick={(e) => { e.stopPropagation(); renameFileId = file.id; renameText = file.name }}
                  class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Rename"
                >
                  <Pencil class="w-4 h-4" />
                </button>
              {/if}
              <button
                onclick={(e) => { e.stopPropagation(); getShareLink(file.storage_path) }}
                class="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Copy link"
              >
                <Link2 class="w-4 h-4" />
              </button>
              <button
                onclick={(e) => { e.stopPropagation(); supabase.from('files').delete().eq('id', file.id).then(() => { if (tab === 'myfiles') loadMyFiles(); else loadSharedFiles(); }) }}
                class="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>

<!-- Modals (centered, clean) -->
{#if showShareModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onclick={() => showShareModal = false}>
    <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 w-full max-w-md" onclick={(e) => e.stopPropagation()}>
      <h2 class="text-lg font-semibold mb-4">Share File</h2>
      <input type="email" placeholder="User email" class="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4" bind:value={shareEmail} />
      <div class="flex justify-end gap-3">
        <button onclick={() => showShareModal = false} class="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Cancel</button>
        <button onclick={shareWithUser} class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors">Share</button>
      </div>
    </div>
  </div>
{/if}

{#if showVersionsModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onclick={() => showVersionsModal = false}>
    <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto" onclick={(e) => e.stopPropagation()}>
      <h2 class="text-lg font-semibold mb-4">Versions of {versionsFileName}</h2>
      {#if versionsList.length === 0}
        <p class="text-sm text-slate-500">No previous versions.</p>
      {:else}
        <ul class="space-y-2">
          {#each versionsList as version}
            <li class="flex justify-between items-center p-2 rounded-lg border border-slate-200 dark:border-slate-800">
              <div>
                <span class="font-medium text-sm">v{version.version_number}</span>
                <span class="text-xs text-slate-500 ml-2">{new Date(version.created_at).toLocaleDateString()}</span>
                <span class="text-xs text-slate-500 ml-2">{version.size ? (version.size / 1024).toFixed(1) + ' KB' : ''}</span>
              </div>
              <button onclick={() => downloadVersion(version.storage_path)} class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">Download</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="mt-4 text-right">
        <button onclick={() => showVersionsModal = false} class="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Close</button>
      </div>
    </div>
  </div>
{/if}

{#if previewFile}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onclick={() => previewFile = null}>
    <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl max-h-[90vh] overflow-auto w-full" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
        <h3 class="font-semibold text-lg">{previewFile.name}</h3>
        <button onclick={() => previewFile = null} class="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X class="w-5 h-5" /></button>
      </div>
      <div class="p-4">
        {#if previewFile.type.startsWith('image/')}
          <img src={previewFile.url} alt={previewFile.name} class="max-w-full max-h-[75vh] object-contain rounded" />
        {:else if previewFile.type.startsWith('video/')}
          <video src={previewFile.url} controls class="max-w-full max-h-[75vh] rounded"></video>
        {:else if previewFile.type === 'application/pdf'}
          <iframe src={previewFile.url} class="w-full h-[75vh] rounded"></iframe>
        {:else}
          <p class="text-center text-slate-500 py-12">Preview not available for this file type.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
