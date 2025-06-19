import { Text3DElement, Text3DManager, Transform3D, TextStyle, DEFAULT_TEXT_STYLE, DEFAULT_TRANSFORM } from './Text3DTypes';

export class Text3DManagerImpl implements Text3DManager {
  private texts: Map<string, Text3DElement> = new Map();
  private selectedTextId: string | null = null;
  private textCounter = 1;

  // Core operations
  createText(trackerId: string, pointId?: string): Text3DElement {
    const textId = `text3d_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newText: Text3DElement = {
      id: textId,
      content: 'Sample Text',
      transform: { ...DEFAULT_TRANSFORM },
      style: { ...DEFAULT_TEXT_STYLE },
      isSelected: false,
      isVisible: true,
      attachedToTrackerId: trackerId,
      attachedToPointId: pointId,
      createdFrame: 0, // Will be set by caller
      name: `Text ${this.textCounter++}`
    };

    this.texts.set(textId, newText);
    console.log(`[TEXT3D] Created text element: ${textId} for tracker: ${trackerId}`);
    
    return newText;
  }

  updateText(textId: string, updates: Partial<Text3DElement>): void {
    const text = this.texts.get(textId);
    if (!text) {
      console.warn(`[TEXT3D] Text not found: ${textId}`);
      return;
    }

    // Create updated text object
    const updatedText = { ...text, ...updates };
    this.texts.set(textId, updatedText);
    
    console.log(`[TEXT3D] Updated text element: ${textId}`);
  }

  deleteText(textId: string): void {
    if (this.texts.delete(textId)) {
      if (this.selectedTextId === textId) {
        this.selectedTextId = null;
      }
      console.log(`[TEXT3D] Deleted text element: ${textId}`);
    } else {
      console.warn(`[TEXT3D] Failed to delete text: ${textId} not found`);
    }
  }

  // Selection management
  selectText(textId: string): void {
    // Deselect all first
    this.deselectAll();

    const text = this.texts.get(textId);
    if (text) {
      text.isSelected = true;
      this.selectedTextId = textId;
      this.texts.set(textId, text);
      console.log(`[TEXT3D] Selected text: ${textId}`);
    }
  }

  deselectAll(): void {
    this.texts.forEach((text) => {
      if (text.isSelected) {
        text.isSelected = false;
        this.texts.set(text.id, text);
      }
    });
    this.selectedTextId = null;
    console.log(`[TEXT3D] Deselected all texts`);
  }

  getSelectedText(): Text3DElement | null {
    if (this.selectedTextId) {
      return this.texts.get(this.selectedTextId) || null;
    }
    return null;
  }

  // Retrieval
  getAllTexts(): Text3DElement[] {
    return Array.from(this.texts.values());
  }

  getTextsForTracker(trackerId: string): Text3DElement[] {
    return Array.from(this.texts.values()).filter(
      text => text.attachedToTrackerId === trackerId
    );
  }

  getTextById(textId: string): Text3DElement | null {
    return this.texts.get(textId) || null;
  }

  // Transform operations
  updateTransform(textId: string, transform: Partial<Transform3D>): void {
    const text = this.texts.get(textId);
    if (!text) {
      console.warn(`[TEXT3D] Text not found for transform update: ${textId}`);
      return;
    }

    const updatedTransform: Transform3D = {
      position: { ...text.transform.position, ...transform.position },
      rotation: { ...text.transform.rotation, ...transform.rotation },
      scale: { ...text.transform.scale, ...transform.scale }
    };

    this.updateText(textId, { transform: updatedTransform });
    console.log(`[TEXT3D] Updated transform for text: ${textId}`, updatedTransform);
  }

  updateStyle(textId: string, style: Partial<TextStyle>): void {
    const text = this.texts.get(textId);
    if (!text) {
      console.warn(`[TEXT3D] Text not found for style update: ${textId}`);
      return;
    }

    const updatedStyle: TextStyle = {
      ...text.style,
      ...style
    };

    this.updateText(textId, { style: updatedStyle });
    console.log(`[TEXT3D] Updated style for text: ${textId}`, updatedStyle);
  }

  updateContent(textId: string, content: string): void {
    this.updateText(textId, { content });
    console.log(`[TEXT3D] Updated content for text: ${textId}`, content);
  }

  // Utility methods
  getTextCountForTracker(trackerId: string): number {
    return this.getTextsForTracker(trackerId).length;
  }

  clearAllTexts(): void {
    this.texts.clear();
    this.selectedTextId = null;
    this.textCounter = 1;
    console.log(`[TEXT3D] Cleared all text elements`);
  }

  clearTextsForTracker(trackerId: string): void {
    const textsToDelete = this.getTextsForTracker(trackerId);
    textsToDelete.forEach(text => {
      this.deleteText(text.id);
    });
    console.log(`[TEXT3D] Cleared ${textsToDelete.length} texts for tracker: ${trackerId}`);
  }
}
