<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import { Loader2, File, Folder, Upload, Trash2, Share2, Pencil, Search, Moon, Sun, LogOut, History, ChevronRight, Plus, X, Image, Video, FileText, Cloud, ArrowLeft, Link2 } from 'lucide-svelte'

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
  let sidebarOpen = $state(false)

  // Reuse existing functions (identical to previous version, no changes needed)
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
      alert('Link copied to clipboard!')
    } catch (err) {
      alert('Share error: ' + err.message)
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
    const name = prompt('Enter folder name:')
    if (!name) return
    const { error } = await supabase.from('files').insert({
      user_id: userID,
      name: name,
      folder: folder,
      size: 0,
      mime_type: 'folder',
      storage_path: '',
    })
    if (error) alert('Folder creation failed: ' + error.message)
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
      alert('Shared successfully!')
      showShareModal = false
      shareEmail = ''
      shareFileId = null
    } else {
      alert('Error: ' + (result.error || 'Failed to share'))
    }
  }

  async function showVersions(fileId, fileName) {
    const { data, error } = await supabase
      .from('file_versions')
      .select('*')
      .eq('file_id', fileId)
      .order('version_number', { ascending: false })
    if (error) {
      alert('Error loading versions: ' + error.message)
      return
    }
    versionsList = data || []
    versionsFileName = fileName
    showVersionsModal = true
  }

  async function downloadVersion(storagePath) {
    if (!storagePath) return
    try {
      const res = await fetch('/api/presigned-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: storagePath }),
      })
      const { url } = await res.json()
      if (url) window.open(url, '_blank')
    } catch (e) { alert('Failed to get download link') }
  }

  async function logout() {
    await supabase.auth.signOut()
    goto('/login')
  }
</script>

<!-- Full redesigned UI with sidebar, glassmorphism, professional file list -->
<div class="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-950">
  <!-- Sidebar -->
  <aside class="w-64 flex-shrink-0 bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-800 flex flex-col transition-all duration-300 {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static z-30 h-full">
    <div class="p-6 border-b border-surface-200 dark:border-surface-800">
      <div class="flex items-center gap-2 text-xl font-bold text-surface-900 dark:text-white">
        <div class="w-8 h-8 bg-accent-600 rounded-lg flex items-center justify-center text-white">☁️</div>
        MyCloud
      </div>
    </div>
    <nav class="flex-1 p-4 space-y-2">
      <button
        onclick={() => { tab = 'myfiles'; sidebarOpen = false }}
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors {tab === 'myfiles' ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-400 font-medium' : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}"
      >
        <File class="w-5 h-5" />
        My Files
      </button>
      <button
        onclick={() => { tab = 'shared'; sidebarOpen = false }}
        class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors {tab === 'shared' ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-400 font-medium' : 'text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800'}"
      >
        <Share2 class="w-5 h-5" />
        Shared with Me
      </button>
    </nav>
    <div class="p-4 border-t border-surface-200 dark:border-surface-800 flex items-center gap-3">
      <button
        onclick={() => document.documentElement.classList.toggle('dark')}
        class="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
        title="Toggle dark mode"
      >
        <Moon class="w-5 h-5 hidden dark:block" />
        <Sun class="w-5 h-5 block dark:hidden" />
      </button>
      <button
        onclick={logout}
        class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        <LogOut class="w-4 h-4" />
        Logout
      </button>
    </div>
  </aside>

  <!-- Mobile sidebar overlay -->
  {#if sidebarOpen}
    <div class="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden" onclick={() => sidebarOpen = false}></div>
  {/if}

  <!-- Main content -->
  <main class="flex-1 overflow-y-auto">
    <!-- Top bar (mobile) -->
    <div class="sticky top-0 z-10 bg-white/80 dark:bg-surface-900/80 backdrop-blur-lg border-b border-surface-200 dark:border-surface-800 p-4 flex items-center gap-3 md:hidden">
      <button onclick={() => sidebarOpen = true} class="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
      <h1 class="text-lg font-bold">MyCloud</h1>
    </div>

    <div class="p-6 max-w-5xl mx-auto">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 class="text-3xl font-bold text-surface-900 dark:text-white">
            {tab === 'myfiles' ? 'My Files' : 'Shared with Me'}
          </h1>
          <p class="text-surface-500 dark:text-surface-400 mt-1">
            {tab === 'myfiles' ? 'Manage your personal files' : 'Files shared with you'}
          </p>
        </div>
        {#if tab === 'myfiles'}
          <div class="flex gap-2">
            <button
              onclick={createFolder}
              class="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors active:scale-[0.98]"
            >
              <Plus class="w-4 h-4" />
              New Folder
            </button>
            <label class="inline-flex items-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-xl text-sm font-medium cursor-pointer transition-colors active:scale-[0.98]">
              <Upload class="w-4 h-4" />
              Upload
              <input type="file" multiple class="hidden" onchange={uploadFiles} />
            </label>
          </div>
        {/if}
      </div>

      <!-- Search -->
      <div class="relative mb-6">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
        <input
          type="text"
          placeholder="Search files..."
          class="w-full pl-10 pr-4 py-3 border border-surface-200 dark:border-surface-700 rounded-xl bg-white dark:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent text-surface-900 dark:text-white placeholder:text-surface-400 transition-all"
          bind:value={searchQuery}
        />
      </div>

      <!-- Breadcrumb (my files only) -->
      {#if tab === 'myfiles'}
        <div class="flex items-center gap-1 mb-4 text-sm text-surface-500 dark:text-surface-400 overflow-x-auto whitespace-nowrap pb-2">
          <button onclick={() => { folder='/'; loadMyFiles() }} class="hover:text-accent-600 transition-colors flex items-center gap-1">
            <Folder class="w-4 h-4" />
            Home
          </button>
          {#each folder.split('/').filter(Boolean) as part, i}
            <ChevronRight class="w-4 h-4 mx-1" />
            <button
              onclick={() => {
                folder = '/' + folder.split('/').slice(1, i+1).join('/')
                loadMyFiles()
              }}
              class="hover:text-accent-600 transition-colors"
            >
              {part}
            </button>
          {/each}
        </div>
      {/if}

      <!-- Upload zone (empty state) -->
      {#if tab === 'myfiles' && !loading && files.length === 0 && !searchQuery}
        <div
          class="border-2 border-dashed border-surface-300 dark:border-surface-700 rounded-2xl p-12 text-center mb-6 transition-all"
          class:border-accent-400={dragOver}
          class:bg-accent-50/50={dragOver}
          ondragover={(e) => { e.preventDefault(); dragOver = true }}
          ondragleave={() => dragOver = false}
          ondrop={handleDrop}
          role="region"
          aria-label="file upload area"
        >
          <label class="cursor-pointer flex flex-col items-center gap-4">
            <div class="w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-900/20 flex items-center justify-center text-accent-600">
              <Upload class="w-8 h-8" />
            </div>
            <div>
              <p class="text-surface-700 dark:text-surface-200 font-medium">Drag & drop files here</p>
              <p class="text-surface-400 dark:text-surface-500 text-sm mt-1">or click to browse</p>
            </div>
            <input type="file" multiple class="hidden" onchange={uploadFiles} />
          </label>
        </div>
      {/if}

      {#if uploading}
        <div class="flex items-center gap-3 text-accent-600 mb-4 animate-fade-in">
          <Loader2 class="w-5 h-5 animate-spin" />
          <span class="text-sm">Uploading files…</span>
        </div>
      {/if}

      {#if selectedFiles.size > 0}
        <div class="flex items-center gap-2 mb-4 animate-slide-up">
          <span class="text-sm text-surface-500">{selectedFiles.size} selected</span>
          <button
            onclick={deleteSelected}
            class="inline-flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            <Trash2 class="w-4 h-4" />
            Delete
          </button>
        </div>
      {/if}

      <!-- File list -->
      <div class="card overflow-hidden">
        {#if loading}
          <div class="p-6 space-y-4">
            {#each Array(5) as _}
              <div class="flex items-center gap-4 animate-pulse">
                <div class="w-10 h-10 rounded-xl bg-surface-200 dark:bg-surface-700"></div>
                <div class="flex-1 space-y-2">
                  <div class="w-3/5 h-4 rounded bg-surface-200 dark:bg-surface-700"></div>
                  <div class="w-2/5 h-3 rounded bg-surface-200 dark:bg-surface-700"></div>
                </div>
                <div class="w-16 h-8 rounded-lg bg-surface-200 dark:bg-surface-700"></div>
              </div>
            {/each}
          </div>
        {:else if (tab === 'myfiles' && files.length === 0) || (tab === 'shared' && sharedFiles.length === 0)}
          <div class="p-12 text-center">
            <File class="w-12 h-12 text-surface-300 dark:text-surface-700 mx-auto mb-3" />
            <p class="text-surface-500 dark:text-surface-400 font-medium">No files yet</p>
            <p class="text-surface-400 dark:text-surface-500 text-sm mt-1">
              {tab === 'myfiles' ? 'Upload your first file to get started.' : 'No files have been shared with you.'}
            </p>
          </div>
        {:else}
          <div class="divide-y divide-surface-100 dark:divide-surface-800">
            {#each (tab === 'myfiles' ? files : sharedFiles).filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) as file (file.id)}
              <div class="flex items-center gap-4 p-4 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors group">
                <input
                  type="checkbox"
                  checked={selectedFiles.has(file.id)}
                  onchange={() => toggleSelect(file.id)}
                  class="w-4 h-4 rounded border-surface-300 dark:border-surface-600 text-accent-600 focus:ring-accent-500 opacity-0 group-hover:opacity-100 {selectedFiles.has(file.id) ? 'opacity-100' : ''}"
                />

                <div class="flex-shrink-0">
                  {#if file.mime_type === 'folder'}
                    <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 cursor-pointer" onclick={() => navigateToFolder(file.name)}>
                      <Folder class="w-5 h-5" />
                    </div>
                  {:else if file.mime_type?.startsWith('image/') && thumbnails[file.id]}
                    <img src={thumbnails[file.id]} alt={file.name} class="w-10 h-10 rounded-xl object-cover cursor-pointer" onclick={() => openPreview(file)} />
                  {:else if file.mime_type?.startsWith('video/')}
                    <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 cursor-pointer" onclick={() => openPreview(file)}>
                      <Video class="w-5 h-5" />
                    </div>
                  {:else if file.mime_type === 'application/pdf'}
                    <div class="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 cursor-pointer" onclick={() => openPreview(file)}>
                      <FileText class="w-5 h-5" />
                    </div>
                  {:else}
                    <div class="w-10 h-10 rounded-xl bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-surface-500 cursor-pointer" onclick={() => openPreview(file)}>
                      <File class="w-5 h-5" />
                    </div>
                  {/if}
                </div>

                <div class="flex-1 min-w-0">
                  {#if renameFileId === file.id}
                    <input
                      type="text"
                      bind:value={renameText}
                      onkeydown={(e) => e.key === 'Enter' && renameFile(file.id, renameText)}
                      class="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-2 py-1 text-sm bg-surface-50 dark:bg-surface-800"
                      onblur={() => renameFile(file.id, renameText)}
                    />
                  {:else}
                    <p class="font-medium text-surface-900 dark:text-white truncate {file.mime_type === 'folder' ? 'cursor-pointer hover:text-accent-600' : ''}" onclick={() => file.mime_type === 'folder' ? navigateToFolder(file.name) : openPreview(file)}>
                      {file.name}
                    </p>
                  {/if}
                  <p class="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
                    {file.mime_type === 'folder' ? 'Folder' : `${file.size ? (file.size / 1024).toFixed(1) + ' KB' : 'Unknown size'} · ${new Date(file.created_at).toLocaleDateString()}`}
                  </p>
                </div>

                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {#if tab === 'myfiles' && file.mime_type !== 'folder'}
                    <button onclick={() => { shareFileId = file.id; showShareModal = true }} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 dark:text-surface-400 transition-colors" title="Share">
                      <Share2 class="w-4 h-4" />
                    </button>
                    <button onclick={() => showVersions(file.id, file.name)} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 dark:text-surface-400 transition-colors" title="Versions">
                      <History class="w-4 h-4" />
                    </button>
                  {/if}
                  {#if tab === 'myfiles'}
                    <button onclick={() => { renameFileId = file.id; renameText = file.name }} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 dark:text-surface-400 transition-colors" title="Rename">
                      <Pencil class="w-4 h-4" />
                    </button>
                  {/if}
                  <button onclick={() => getShareLink(file.storage_path)} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 dark:text-surface-400 transition-colors" title="Copy link">
                    <Link2 class="w-4 h-4" />
                  </button>
                  <button onclick={async () => { await supabase.from('files').delete().eq('id', file.id); if (tab === 'myfiles') await loadMyFiles(); else await loadSharedFiles(); }} class="w-8 h-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-surface-500 dark:text-surface-400 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Delete">
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </main>
</div>

<!-- Share Modal -->
{#if showShareModal}
  <div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick={() => showShareModal = false}>
    <div class="glass rounded-2xl p-6 w-full max-w-md animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-surface-900 dark:text-white">Share File</h2>
        <button onclick={() => showShareModal = false} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 transition-colors"><X class="w-4 h-4" /></button>
      </div>
      <input type="email" placeholder="User email address" class="w-full px-4 py-3 border border-surface-200 dark:border-surface-700 rounded-xl bg-white/50 dark:bg-surface-900/50 focus:outline-none focus:ring-2 focus:ring-accent-500 mb-4 text-surface-900 dark:text-white placeholder:text-surface-400" bind:value={shareEmail} />
      <div class="flex gap-3 justify-end">
        <button onclick={() => showShareModal = false} class="px-4 py-2.5 bg-surface-100 dark:bg-surface-800 rounded-xl text-sm font-medium text-surface-700 dark:text-surface-200 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors">Cancel</button>
        <button onclick={shareWithUser} class="px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-xl text-sm font-medium transition-colors active:scale-[0.98]">Share</button>
      </div>
    </div>
  </div>
{/if}

<!-- Versions Modal -->
{#if showVersionsModal}
  <div class="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick={() => showVersionsModal = false}>
    <div class="glass rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-bold text-surface-900 dark:text-white">Versions of {versionsFileName}</h2>
        <button onclick={() => showVersionsModal = false} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 transition-colors"><X class="w-4 h-4" /></button>
      </div>
      {#if versionsList.length === 0}
        <p class="text-surface-500 dark:text-surface-400 text-sm">No previous versions available.</p>
      {:else}
        <ul class="space-y-2">
          {#each versionsList as version}
            <li class="flex justify-between items-center p-2 rounded-xl hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors">
              <div>
                <span class="font-medium text-surface-900 dark:text-white">v{version.version_number}</span>
                <span class="text-xs text-surface-400 ml-2">{new Date(version.created_at).toLocaleDateString()}</span>
                <span class="text-xs text-surface-400 ml-2">{version.size ? (version.size / 1024).toFixed(1) + ' KB' : ''}</span>
              </div>
              <button onclick={() => downloadVersion(version.storage_path)} class="text-sm text-accent-600 hover:text-accent-700 font-medium">Download</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<!-- Preview Modal -->
{#if previewFile}
  <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick={() => previewFile = null}>
    <div class="bg-white dark:bg-surface-800 rounded-2xl max-w-4xl max-h-[90vh] overflow-auto w-full animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center p-4 border-b border-surface-200 dark:border-surface-700">
        <h3 class="font-bold text-surface-900 dark:text-white">{previewFile.name}</h3>
        <button onclick={() => previewFile = null} class="w-8 h-8 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 flex items-center justify-center text-surface-500 transition-colors"><X class="w-5 h-5" /></button>
      </div>
      <div class="p-4">
        {#if previewFile.type.startsWith('image/')}
          <img src={previewFile.url} alt={previewFile.name} class="max-w-full max-h-[75vh] object-contain rounded-lg" />
        {:else if previewFile.type.startsWith('video/')}
          <video src={previewFile.url} controls class="max-w-full max-h-[75vh] rounded-lg"></video>
        {:else if previewFile.type === 'application/pdf'}
          <iframe src={previewFile.url} class="w-full h-[75vh] rounded-lg"></iframe>
        {:else}
          <p class="text-surface-500 text-center py-8">Preview not available for this file type.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
