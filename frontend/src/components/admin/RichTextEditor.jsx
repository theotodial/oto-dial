import { useMemo, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './RichTextEditor.css';

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
        // For now, we'll use a data URL or prompt for URL
        // In production, you'd upload to your server
        const reader = new FileReader();
        reader.onload = () => {
          const imageUrl = reader.result;
          const quill = quillRef.current?.getEditor();
          const range = quill.getSelection(true);
          quill.insertEmbed(range.index, 'image', imageUrl);
          quill.setSelection(range.index + 1);
        };
        reader.readAsDataURL(file);
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
