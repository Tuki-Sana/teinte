import { ref } from "vue";

export function useAppToast() {
  const toast = ref("");

  function showToast(msg: string) {
    toast.value = msg;
    window.setTimeout(() => {
      toast.value = "";
    }, 2200);
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} をコピーしました`);
    } catch {
      showToast("コピーに失敗しました");
    }
  }

  return { toast, showToast, copyText };
}
