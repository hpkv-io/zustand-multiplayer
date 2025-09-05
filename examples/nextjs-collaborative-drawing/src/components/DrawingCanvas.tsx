import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useDrawingStore } from '../lib/store';
import type { Point, StrokeChunk } from '../lib/store';

interface DrawingCanvasProps {
  width: number;
  height: number;
}

export function DrawingCanvas({ width, height }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);

  const {
    strokes,
    cursors,
    activeStrokes,
    currentStroke,
    currentColor,
    currentThickness,
    isDrawing,
    startDrawing,
    addPointToStroke,
    finishStroke,
    updateCursor,
    currentUser,
  } = useDrawingStore();

  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const drawStroke = useCallback(
    (ctx: CanvasRenderingContext2D, points: Point[], color: string, thickness: number) => {
      if (points.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    },
    [],
  );

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const strokeGroups = new Map<string, StrokeChunk[]>();

    Object.values(strokes).forEach(chunk => {
      if (!strokeGroups.has(chunk.strokeId)) {
        strokeGroups.set(chunk.strokeId, []);
      }
      strokeGroups.get(chunk.strokeId)!.push(chunk);
    });

    strokeGroups.forEach(chunks => {
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const allPoints: Point[] = [];
      let strokeColor = '#000000';
      let strokeThickness = 3;

      chunks.forEach(chunk => {
        if (chunk.points && Array.isArray(chunk.points)) {
          allPoints.push(...chunk.points);
        }
        strokeColor = chunk.color;
        strokeThickness = chunk.thickness;
      });

      if (allPoints.length > 0) {
        drawStroke(ctx, allPoints, strokeColor, strokeThickness);
      }
    });

    if (isDrawing && currentStroke.length > 0) {
      drawStroke(ctx, currentStroke, currentColor, currentThickness);
    }

    // Draw active strokes from other users
    Object.values(activeStrokes).forEach(activeStroke => {
      if (!currentUser || activeStroke.userId !== currentUser.id) {
        if (activeStroke.points && activeStroke.points.length > 0) {
          drawStroke(ctx, activeStroke.points, activeStroke.color, activeStroke.thickness);
        }
      }
    });
  }, [
    strokes,
    activeStrokes,
    currentStroke,
    currentColor,
    currentThickness,
    isDrawing,
    width,
    height,
    drawStroke,
    currentUser,
  ]);

  const drawCursors = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    Object.values(cursors).forEach(cursor => {
      if (currentUser && cursor.userId === currentUser.id) return;

      ctx.save();
      ctx.fillStyle = cursor.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 8, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.fillText(cursor.username, cursor.x + 12, cursor.y - 8);
      ctx.restore();
    });
  }, [cursors, currentUser]);

  useEffect(() => {
    redrawCanvas();
    drawCursors();
  }, [redrawCanvas, drawCursors]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!currentUser) return;

      setIsMouseDown(true);
      const point = getCanvasPoint(e.clientX, e.clientY);
      startDrawing(point);
    },
    [currentUser, getCanvasPoint, startDrawing],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const point = getCanvasPoint(e.clientX, e.clientY);
      updateCursor(point);

      if (isMouseDown && currentUser) {
        addPointToStroke(point);
      }
    },
    [currentUser, isMouseDown, getCanvasPoint, updateCursor, addPointToStroke],
  );

  const handleMouseUp = useCallback(() => {
    if (isMouseDown) {
      setIsMouseDown(false);
      finishStroke();
    }
  }, [isMouseDown, finishStroke]);

  const handleMouseLeave = useCallback(() => {
    if (isMouseDown) {
      setIsMouseDown(false);
      finishStroke();
    }
  }, [isMouseDown, finishStroke]);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="block bg-white cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
