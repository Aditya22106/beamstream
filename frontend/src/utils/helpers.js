export function formatSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export function formatDate(iso) {
  if (!iso) return '—'
  const dt    = new Date(iso)
  const now   = new Date()
  const delta = now - dt

  if (delta < 60_000)          return 'just now'
  if (delta < 3_600_000)       return `${Math.floor(delta / 60_000)} min ago`
  if (delta < 86_400_000)      return `${Math.floor(delta / 3_600_000)} hr ago`
  if (delta < 172_800_000)     return 'yesterday'
  return dt.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export function fileIcon(mime) {
  if (!mime) return '📎'
  if (mime.includes('pdf'))          return '📄'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.includes('excel') || mime.includes('sheet'))   return '📊'
  if (mime.includes('powerpoint') || mime.includes('presentation')) return '📑'
  if (mime.includes('image'))        return '🖼️'
  if (mime.includes('video'))        return '🎬'
  if (mime.includes('audio'))        return '🎵'
  if (mime.includes('zip') || mime.includes('compressed')) return '📦'
  if (mime.includes('text'))         return '📃'
  return '📎'
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
}

export function getErrMsg(err) {
  return (
    err?.response?.data?.detail ||
    err?.message ||
    'Something went wrong'
  )
}
