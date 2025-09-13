/**
 * UI state management
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UIState, Occurrence } from '../../types';

const initialState: UIState = {
  selectedOccurrence: null,
  modalOpen: false,
  editScope: 'this',
  createEventTime: null,
  createEventDuration: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    openModal: (state, action: PayloadAction<Occurrence>) => {
      state.selectedOccurrence = action.payload;
      state.modalOpen = true;
      state.editScope = 'this'; // Reset to default
    },
    
    openCreateModal: (state, action: PayloadAction<{startTime?: string, duration?: number}>) => {
      state.selectedOccurrence = null; // null indicates create mode
      state.modalOpen = true;
      state.editScope = 'this';
      state.createEventTime = action.payload?.startTime || null;
      state.createEventDuration = action.payload?.duration || null;
    },
    
    closeModal: (state) => {
      state.selectedOccurrence = null;
      state.modalOpen = false;
      state.editScope = 'this';
      state.createEventTime = null;
      state.createEventDuration = null;
    },
    
    setEditScope: (state, action: PayloadAction<'this' | 'future' | 'all'>) => {
      state.editScope = action.payload;
    },
    
    setSelectedOccurrence: (state, action: PayloadAction<Occurrence | null>) => {
      state.selectedOccurrence = action.payload;
    }
  },
});

export const {
  openModal,
  openCreateModal,
  closeModal,
  setEditScope,
  setSelectedOccurrence
} = uiSlice.actions;

// Helper function to create modal with optional parameters
export const openCreateModalWithParams = (params?: {startTime?: string, duration?: number}) => 
  openCreateModal(params || {});

export default uiSlice.reducer;

// Selectors
export const selectUIState = (state: { ui: UIState }) => state.ui;
export const selectSelectedOccurrence = (state: { ui: UIState }) => state.ui.selectedOccurrence;
export const selectModalOpen = (state: { ui: UIState }) => state.ui.modalOpen;
export const selectEditScope = (state: { ui: UIState }) => state.ui.editScope;
export const selectCreateEventTime = (state: { ui: UIState }) => state.ui.createEventTime;
export const selectCreateEventDuration = (state: { ui: UIState }) => state.ui.createEventDuration;
