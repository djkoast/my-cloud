<script>
  let { width = '100%', height = '1rem', rounded = 'md' } = $props()
</script>

<div
  class="animate-pulse bg-surface-200 dark:bg-surface-700 rounded-{rounded}"
  style="width: {width}; height: {height};"
></div>
