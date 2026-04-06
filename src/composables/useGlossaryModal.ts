import { ref } from "vue";

export function useGlossaryModal() {
  const glossaryOpen = ref(false);
  const glossaryFocusEntryId = ref<string | null>(null);

  function openGlossary(focusId?: string | null) {
    glossaryFocusEntryId.value = focusId ?? null;
    glossaryOpen.value = true;
  }

  function onGlossaryClose() {
    glossaryOpen.value = false;
    glossaryFocusEntryId.value = null;
  }

  return {
    glossaryOpen,
    glossaryFocusEntryId,
    openGlossary,
    onGlossaryClose,
  };
}
