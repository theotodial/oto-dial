import { useMemo, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './RichTextEditor.css';
import API from '../../api';

function RichTextEditor({ value, onChange, placeholder = "Start writing..." }) {
  const quillRef = useRef(null);

  // Custom image handler
  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          alert('Only image files are allowed.');
          return;
        }

        const maxBytes = 8 * 1024 * 1024; // 8MB
        if (file.size > maxBytes) {
          alert('Image is too large. Maximum allowed size is 8MB.');
          return;
        }

        const quill = quillRef.current?.getEditor();
        if (!quill) {
          alert('Editor is not ready. Please try again.');
          return;
        }

        try {
          const imageData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsDataURL(file);
          });

          const response = await API.post('/api/blog/admin/upload-image', {
            imageData,
            fileName: file.name
          });

          if (response.error || !response.data?.success || !response.data?.imageUrl) {
            const errorMsg = response.error || response.data?.error || 'Failed to upload image';
            alert(`Image upload failed: ${errorMsg}`);
            return;
          }

          const range = quill.getSelection(true);
          const insertAt = range?.index ?? quill.getLength();
          quill.insertEmbed(insertAt, 'image', response.data.imageUrl);
          quill.setSelection(insertAt + 1);
        } catch (error) {
          alert(error?.message || 'Failed to upload image');
        }
      }
    };
  };

  // Custom video handler
  const videoHandler = () => {
    const url = prompt('Enter video URL:');
    if (url) {
      const quill = quillRef.current?.getEditor();
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'video', url);
      quill.setSelection(range.index + 1);
    }
  };

  // Custom link handler
  const linkHandler = () => {
    const quill = quillRef.current?.getEditor();
    const range = quill.getSelection(true);
    const text = quill.getText(range.index, range.length);
    const url = prompt('Enter URL:', text);
    if (url) {
      if (range.length > 0) {
        quill.formatText(range.index, range.length, 'link', url);
      } else {
        quill.insertText(range.index, url, 'link', url);
      }
    }
  };

  // Modules configuration - WordPress-like toolbar
  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'font': [] }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'script': 'sub' }, { 'script': 'super' }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }, { 'align': [] }],
        ['blockquote', 'code-block'],
        ['link', 'image', 'video'],
        ['clean']
      ],
      handlers: {
        image: imageHandler,
        video: videoHandler,
        link: linkHandler
      }
    },
    clipboard: {
      matchVisual: false
    },
    history: {
      delay: 1000,
      maxStack: 100,
      userOnly: true
    }
  }), []);

  // Formats configuration
  const formats = [
    'header', 'font', 'size',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'script',
    'list', 'bullet', 'indent',
    'direction', 'align',
    'link', 'image', 'video',
    'blockquote', 'code-block'
  ];

  return (
    <div className="rich-text-editor-wrapper">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        className="rich-text-editor"
      />
    </div>
  );
}

export default RichTextEditor;
