import { useState, useRef, useEffect } from 'react';

function ProfilePictureCrop({ image, onCrop, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 200, height: 200 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Set canvas size
        const maxSize = 400;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        // Draw image
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Initialize crop to center
        const cropSize = Math.min(canvas.width, canvas.height) * 0.8;
        setCrop({
          x: (canvas.width - cropSize) / 2,
          y: (canvas.height - cropSize) / 2,
          width: cropSize,
          height: cropSize
        });
      };
      
      img.src = image;
      imageRef.current = img;
    }
  }, [image]);

  const handleMouseDown = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if click is inside crop area
    if (x >= crop.x && x <= crop.x + crop.width &&
        y >= crop.y && y <= crop.y + crop.height) {
      setIsDragging(true);
      setDragStart({ x: x - crop.x, y: y - crop.y });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - dragStart.x;
    const y = e.clientY - rect.top - dragStart.y;
    
    // Constrain crop within canvas
    const maxX = canvasRef.current.width - crop.width;
    const maxY = canvasRef.current.height - crop.height;
    
    setCrop({
      ...crop,
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY))
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleCrop = () => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 200;
    cropCanvas.height = 200;
    const ctx = cropCanvas.getContext('2d');
    
    // Draw cropped image
    ctx.drawImage(
      canvas,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, 200, 200
    );
    
    // Convert to blob
    cropCanvas.toBlob((blob) => {
      if (blob) {
        onCrop(blob);
      }
    }, 'image/png');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-lg w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Crop Profile Picture</h2>
        
        <div 
          ref={containerRef}
          className="relative border-2 border-gray-300 dark:border-slate-600 rounded-lg overflow-hidden mb-4"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} className="max-w-full h-auto" />
          
          {/* Crop overlay */}
          <div
            className="absolute border-2 border-white shadow-lg"
            style={{
              left: `${crop.x}px`,
              top: `${crop.y}px`,
              width: `${crop.width}px`,
              height: `${crop.height}px`,
              borderRadius: '50%',
              pointerEvents: 'none'
            }}
          />
          
          {/* Dark overlay outside crop */}
          <div
            className="absolute inset-0 bg-black/50"
            style={{
              clipPath: `circle(${crop.width / 2}px at ${crop.x + crop.width / 2}px ${crop.y + crop.height / 2}px)`,
              clipPath: `inset(${crop.y}px ${canvasRef.current?.width - crop.x - crop.width}px ${canvasRef.current?.height - crop.y - crop.height}px ${crop.x}px)`
            }}
          />
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 px-4 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors"
          >
            Crop & Save
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProfilePictureCrop;
