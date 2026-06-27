<script>
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase'
  import { goto } from '$app/navigation'
  import { Loader2, FolderPlus, UploadCloud, Trash2, Share2, Pencil, Search, Sun, Moon, LogOut, History, File, Folder, Image, Video, FileText, ChevronRight, X, Link2, Heart, TreePine, Music, Palette, CloudRain } from 'lucide-svelte'

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

<div class="min-h-screen bg-gradient-to-br from-[#1b2f1d] via-[#2e4a2e] to-[#1b2f1d] text-[#f5f0e6] p-4 md:p-8 flex flex-col items-center">
  <!-- Centered container -->
  <div class="w-full max-w-7xl mx-auto">
    
    <!-- Hero – poetic, nature‑inspired -->
    <div class="text-center mb-14 animate-fade-in">
      <div class="inline-flex items-center justify-center gap-3 mb-6">
        <TreePine class="w-10 h-10 text-[#a3b18a]" />
        <Music class="w-8 h-8 text-[#e07a5f]" />
        <Palette class="w-8 h-8 text-[#f4a261]" />
        <Heart class="w-10 h-10 text-[#f2cc8f]" />
      </div>
      <h1 class="text-5xl md:text-7xl font-serif font-bold text-[#f5f0e6] mb-4 tracking-tight">
        {tab === 'myfiles' ? 'My Garden of Files' : 'Shared with Love'}
      </h1>
      <p class="text-lg md:text-xl text-[#cfc5b0] max-w-2xl mx-auto italic">
        {tab === 'myfiles' ? 'A place where your digital moments bloom like wildflowers. Plant a file, watch it grow.' : 'Treasured gifts from kindred spirits, waiting for your touch.'}
      </p>
      <div class="mt-6 flex justify-center gap-3">
        {#if tab === 'myfiles'}
          <button onclick={createFolder} class="inline-flex items-center gap-2 px-6 py-3 bg-[#3d405b]/40 hover:bg-[#3d405b]/60 border border-[#a3b18a]/30 rounded-full text-[#f5f0e6] font-medium transition-all duration-300 backdrop-blur-sm">
            <FolderPlus class="w-5 h-5" />
            New Folder
          </button>
          <label class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#e07a5f] to-[#f4a261] hover:from-[#d06a4f] hover:to-[#e08a51] rounded-full text-white font-medium cursor-pointer transition-all duration-300 shadow-lg shadow-[#e07a5f]/20">
            <UploadCloud class="w-5 h-5" />
            Upload
            <input type="file" multiple class="hidden" onchange={uploadFiles} />
          </label>
        {/if}
        <button onclick={logout} class="inline-flex items-center gap-2 px-5 py-3 text-[#cfc5b0] hover:text-white transition-colors">
          <LogOut class="w-5 h-5" />
          <span class="hidden md:inline">Leave Garden</span>
        </button>
      </div>
    </div>

    <!-- Tabs & Search -->
    <div class="flex flex-col sm:flex-row gap-4 mb-8">
      <div class="flex gap-2 p-1 bg-[#3d405b]/30 backdrop-blur-md border border-[#a3b18a]/20 rounded-full">
        <button onclick={() => tab = 'myfiles'} class="px-6 py-2.5 rounded-full font-medium transition-all duration-300 {tab === 'myfiles' ? 'bg-[#e07a5f] text-white shadow-lg' : 'text-[#cfc5b0] hover:text-white'}">
          My Garden
        </button>
        <button onclick={() => tab = 'shared'} class="px-6 py-2.5 rounded-full font-medium transition-all duration-300 {tab === 'shared' ? 'bg-[#e07a5f] text-white shadow-lg' : 'text-[#cfc5b0] hover:text-white'}">
          Shared with Me
        </button>
      </div>
      <div class="relative flex-1">
        <Search class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a3b18a]" />
        <input
          type="text"
          placeholder="Search your garden..."
          class="w-full pl-12 pr-4 py-3 bg-[#3d405b]/30 backdrop-blur-md border border-[#a3b18a]/20 rounded-full text-[#f5f0e6] placeholder:text-[#a3b18a] focus:outline-none focus:ring-2 focus:ring-[#e07a5f] focus:border-transparent transition-all"
          bind:value={searchQuery}
        />
      </div>
    </div>

    <!-- Breadcrumb (my files) -->
    {#if tab === 'myfiles'}
      <div class="flex items-center gap-2 mb-6 text-sm text-[#a3b18a] overflow-x-auto whitespace-nowrap">
        <button onclick={() => { folder='/'; loadMyFiles() }} class="hover:text-[#e07a5f] transition-colors flex items-center gap-1">
          <Folder class="w-4 h-4" />
          Garden
        </button>
        {#each folder.split('/').filter(Boolean) as part, i}
          <ChevronRight class="w-4 h-4" />
          <button onclick={() => { folder = '/' + folder.split('/').slice(1, i+1).join('/'); loadMyFiles() }} class="hover:text-[#e07a5f] transition-colors">{part}</button>
        {/each}
      </div>
    {/if}

    <!-- Uploading -->
    {#if uploading}
      <div class="flex items-center gap-3 text-[#f4a261] mb-6 animate-pulse">
        <Loader2 class="w-5 h-5 animate-spin" />
        <span>Planting your files...</span>
      </div>
    {/if}

    <!-- Selection bar -->
    {#if selectedFiles.size > 0}
      <div class="flex items-center gap-3 mb-6 animate-slide-up">
        <span class="text-sm text-[#cfc5b0]">{selectedFiles.size} selected</span>
        <button onclick={deleteSelected} class="px-3 py-1.5 bg-[#e07a5f]/20 text-[#e07a5f] rounded-full text-sm font-medium hover:bg-[#e07a5f]/30 transition-colors">
          <Trash2 class="w-4 h-4 inline mr-1" /> Compost
        </button>
      </div>
    {/if}

    <!-- File Grid -->
    {#if loading}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {#each Array(8) as _}
          <div class="rounded-3xl bg-[#3d405b]/20 border border-[#a3b18a]/10 p-6 animate-pulse">
            <div class="w-10 h-10 rounded-2xl bg-[#3d405b]/40 mb-4"></div>
            <div class="w-3/4 h-5 bg-[#3d405b]/40 rounded mb-2"></div>
            <div class="w-1/2 h-4 bg-[#3d405b]/40 rounded"></div>
          </div>
        {/each}
      </div>
    {:else if (tab === 'myfiles' && files.length === 0) || (tab === 'shared' && sharedFiles.length === 0)}
      <div class="text-center py-24">
        <div class="inline-flex items-center justify-center w-24 h-24 rounded-full bg-[#3d405b]/30 border border-[#a3b18a]/20 mb-8">
          <TreePine class="w-12 h-12 text-[#a3b18a]" />
        </div>
        <h3 class="text-2xl font-serif text-[#f5f0e6] mb-3">Your Garden Awaits</h3>
        <p class="text-[#a3b18a] max-w-md mx-auto">
          {tab === 'myfiles' ? 'Plant your first file and watch your digital garden grow.' : 'No gifts yet. Share your garden with someone you love.'}
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {#each (tab === 'myfiles' ? files : sharedFiles).filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) as file (file.id)}
          <div
            class="group relative rounded-3xl bg-[#3d405b]/20 backdrop-blur-md border border-[#a3b18a]/20 hover:border-[#e07a5f]/40 hover:bg-[#3d405b]/30 transition-all duration-500 p-6 cursor-pointer overflow-hidden"
            onclick={() => file.mime_type === 'folder' ? navigateToFolder(file.name) : openPreview(file)}
            onkeydown={(e) => e.key === 'Enter' && (file.mime_type === 'folder' ? navigateToFolder(file.name) : openPreview(file))}
            role="button"
            tabindex="0"
          >
            <!-- Selection check -->
            <button
              class="absolute top-4 right-4 w-7 h-7 rounded-full border border-[#a3b18a]/30 flex items-center justify-center opacity-0 group-hover:opacity-100 {selectedFiles.has(file.id) ? 'opacity-100 bg-[#e07a5f] border-[#e07a5f]' : ''} transition-opacity z-10"
              onclick={(e) => { e.stopPropagation(); toggleSelect(file.id) }}
            >
              {#if selectedFiles.has(file.id)}
                <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
              {/if}
            </button>

            <!-- Icon -->
            <div class="mb-5">
              {#if file.mime_type === 'folder'}
                <div class="w-14 h-14 rounded-2xl bg-[#f4a261]/20 flex items-center justify-center text-[#f4a261]">
                  <Folder class="w-7 h-7" />
                </div>
              {:else if file.mime_type?.startsWith('image/') && thumbnails[file.id]}
                <img src={thumbnails[file.id]} alt={file.name} class="w-14 h-14 rounded-2xl object-cover" />
              {:else if file.mime_type?.startsWith('video/')}
                <div class="w-14 h-14 rounded-2xl bg-[#457b9d]/20 flex items-center justify-center text-[#457b9d]">
                  <Video class="w-7 h-7" />
                </div>
              {:else if file.mime_type === 'application/pdf'}
                <div class="w-14 h-14 rounded-2xl bg-[#e07a5f]/20 flex items-center justify-center text-[#e07a5f]">
                  <FileText class="w-7 h-7" />
                </div>
              {:else}
                <div class="w-14 h-14 rounded-2xl bg-[#cfc5b0]/20 flex items-center justify-center text-[#cfc5b0]">
                  <File class="w-7 h-7" />
                </div>
              {/if}
            </div>

            <!-- Name & size -->
            <h3 class="font-semibold text-[#f5f0e6] text-lg truncate mb-1">{file.name}</h3>
            <p class="text-xs text-[#a3b18a]">
              {file.mime_type === 'folder' ? 'Folder' : `${file.size ? (file.size / 1024).toFixed(1) + ' KB' : ''}`}
              <span class="mx-1">·</span>
              {new Date(file.created_at).toLocaleDateString()}
            </p>

            <!-- Hover actions -->
            <div class="flex items-center gap-2 mt-5 opacity-0 group-hover:opacity-100 transition-opacity">
              {#if tab === 'myfiles' && file.mime_type !== 'folder'}
                <button
                  onclick={(e) => { e.stopPropagation(); shareFileId = file.id; showShareModal = true }}
                  class="p-2 rounded-xl bg-white/10 hover:bg-[#e07a5f]/20 text-[#cfc5b0] hover:text-[#e07a5f] transition-all"
                  title="Share"
                >
                  <Share2 class="w-4 h-4" />
                </button>
                <button
                  onclick={(e) => { e.stopPropagation(); showVersions(file.id, file.name) }}
                  class="p-2 rounded-xl bg-white/10 hover:bg-[#f4a261]/20 text-[#cfc5b0] hover:text-[#f4a261] transition-all"
                  title="Versions"
                >
                  <History class="w-4 h-4" />
                </button>
              {/if}
              {#if tab === 'myfiles'}
                <button
                  onclick={(e) => { e.stopPropagation(); renameFileId = file.id; renameText = file.name }}
                  class="p-2 rounded-xl bg-white/10 hover:bg-[#457b9d]/20 text-[#cfc5b0] hover:text-[#457b9d] transition-all"
                  title="Rename"
                >
                  <Pencil class="w-4 h-4" />
                </button>
              {/if}
              <button
                onclick={(e) => { e.stopPropagation(); getShareLink(file.storage_path) }}
                class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-[#cfc5b0] hover:text-white transition-all"
                title="Copy link"
              >
                <Link2 class="w-4 h-4" />
              </button>
              <button
                onclick={(e) => { e.stopPropagation(); supabase.from('files').delete().eq('id', file.id).then(() => { if (tab === 'myfiles') loadMyFiles(); else loadSharedFiles(); }) }}
                class="p-2 rounded-xl bg-white/10 hover:bg-red-500/20 text-[#cfc5b0] hover:text-red-400 transition-all"
                title="Delete"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>

            <!-- Subtle decorative element: a tiny heart in the corner for love theme -->
            <div class="absolute bottom-3 right-3 opacity-10 group-hover:opacity-30 transition-opacity">
              <Heart class="w-4 h-4 text-[#f2cc8f]" />
            </div>
          </div>
        {/each}
      </div>
    {/if}

  </div>
</div>

<!-- Modals with nature theme -->
{#if showShareModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onclick={() => showShareModal = false}>
    <div class="bg-[#2e4a2e] border border-[#a3b18a]/30 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <h2 class="text-2xl font-serif text-[#f5f0e6] mb-4">Share a Treasure</h2>
      <input type="email" placeholder="Friend's email" class="w-full px-4 py-3 bg-[#1b2f1d] border border-[#a3b18a]/30 rounded-xl text-[#f5f0e6] placeholder:text-[#a3b18a] focus:outline-none focus:ring-2 focus:ring-[#e07a5f] mb-4" bind:value={shareEmail} />
      <div class="flex justify-end gap-3">
        <button onclick={() => showShareModal = false} class="px-5 py-2 bg-[#3d405b]/40 hover:bg-[#3d405b]/60 rounded-full text-[#cfc5b0] transition-colors">Cancel</button>
        <button onclick={shareWithUser} class="px-5 py-2 bg-gradient-to-r from-[#e07a5f] to-[#f4a261] hover:from-[#d06a4f] hover:to-[#e08a51] rounded-full text-white transition-all">Share</button>
      </div>
    </div>
  </div>
{/if}

{#if showVersionsModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onclick={() => showVersionsModal = false}>
    <div class="bg-[#2e4a2e] border border-[#a3b18a]/30 rounded-3xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <h2 class="text-2xl font-serif text-[#f5f0e6] mb-4">Past Blossoms of {versionsFileName}</h2>
      {#if versionsList.length === 0}
        <p class="text-[#a3b18a]">No previous versions.</p>
      {:else}
        <ul class="space-y-3">
          {#each versionsList as version}
            <li class="flex justify-between items-center p-3 bg-[#1b2f1d] rounded-2xl">
              <div>
                <span class="font-medium text-[#f5f0e6]">v{version.version_number}</span>
                <span class="text-xs text-[#a3b18a] ml-2">{new Date(version.created_at).toLocaleDateString()}</span>
                <span class="text-xs text-[#a3b18a] ml-2">{version.size ? (version.size / 1024).toFixed(1) + ' KB' : ''}</span>
              </div>
              <button onclick={() => downloadVersion(version.storage_path)} class="text-[#f4a261] hover:text-[#e07a5f] text-sm font-medium">Pick</button>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="mt-4 text-right">
        <button onclick={() => showVersionsModal = false} class="px-4 py-2 bg-[#3d405b]/40 rounded-full text-[#cfc5b0]">Close</button>
      </div>
    </div>
  </div>
{/if}

{#if previewFile}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onclick={() => previewFile = null}>
    <div class="bg-[#2e4a2e] border border-[#a3b18a]/30 rounded-3xl max-w-4xl max-h-[90vh] overflow-auto w-full animate-slide-up" onclick={(e) => e.stopPropagation()}>
      <div class="flex justify-between items-center p-5 border-b border-[#a3b18a]/20">
        <h3 class="font-serif text-xl text-[#f5f0e6]">{previewFile.name}</h3>
        <button onclick={() => previewFile = null} class="text-[#cfc5b0] hover:text-white transition-colors"><X class="w-6 h-6" /></button>
      </div>
      <div class="p-4">
        {#if previewFile.type.startsWith('image/')}
          <img src={previewFile.url} alt={previewFile.name} class="max-w-full max-h-[75vh] object-contain rounded-2xl" />
        {:else if previewFile.type.startsWith('video/')}
          <video src={previewFile.url} controls class="max-w-full max-h-[75vh] rounded-2xl"></video>
        {:else if previewFile.type === 'application/pdf'}
          <iframe src={previewFile.url} class="w-full h-[75vh] rounded-2xl"></iframe>
        {:else}
          <p class="text-center text-[#a3b18a] py-12">Preview not available for this file type.</p>
        {/if}
      </div>
    </div>
  </div>
{/if}
