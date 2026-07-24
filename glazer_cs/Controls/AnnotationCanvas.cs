using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;
using Avalonia.Media.Imaging;

namespace GlazerAdmin.Controls;

/// <summary>
/// The annotation drawing surface. Owns a world-space viewport (pan/zoom) and
/// renders the current image, a world grid, and a screen-space crosshair.
/// Coordinate model matches the original web app:
///   screen = (world + viewport) * scale
///   world  = screen / scale - viewport
/// Tool routing (rectangle drawing, selection, …) will be layered on top of the
/// pointer events here once the ToolSystem port lands.
/// </summary>
public class AnnotationCanvas : Control
{
    public static readonly StyledProperty<Bitmap?> ImageProperty =
        AvaloniaProperty.Register<AnnotationCanvas, Bitmap?>(nameof(Image));

    public static readonly StyledProperty<Color> CanvasBackgroundProperty =
        AvaloniaProperty.Register<AnnotationCanvas, Color>(nameof(CanvasBackground), Color.Parse("#3B3B3B"));

    private const double ZoomSensitivity = 1.1;
    private const double MinScale = 0.05;
    private const double MaxScale = 10.0;
    private const double GridStep = 100.0;

    private double _viewportX;
    private double _viewportY;
    private double _scale = 1.0;

    private bool _isPanning;
    private Point _lastPointer;
    private Point? _crosshair;

    static AnnotationCanvas()
    {
        AffectsRender<AnnotationCanvas>(ImageProperty, CanvasBackgroundProperty);
    }

    public AnnotationCanvas()
    {
        ClipToBounds = true;
        Focusable = true;
    }

    public Bitmap? Image
    {
        get => GetValue(ImageProperty);
        set => SetValue(ImageProperty, value);
    }

    public Color CanvasBackground
    {
        get => GetValue(CanvasBackgroundProperty);
        set => SetValue(CanvasBackgroundProperty, value);
    }

    public Point ScreenToWorld(Point screen) =>
        new(screen.X / _scale - _viewportX, screen.Y / _scale - _viewportY);

    public Point WorldToScreen(Point world) =>
        new((world.X + _viewportX) * _scale, (world.Y + _viewportY) * _scale);

    /// <summary>Centers the image (or resets to origin) and fits it into the control.</summary>
    public void FitToView()
    {
        var image = Image;
        if (image is null || Bounds.Width <= 0 || Bounds.Height <= 0)
        {
            _viewportX = 0;
            _viewportY = 0;
            _scale = 1.0;
            InvalidateVisual();
            return;
        }

        var size = image.Size;
        _scale = System.Math.Min(Bounds.Width / size.Width, Bounds.Height / size.Height) * 0.95;
        _viewportX = (Bounds.Width / _scale - size.Width) / 2;
        _viewportY = (Bounds.Height / _scale - size.Height) / 2;
        InvalidateVisual();
    }

    public override void Render(DrawingContext context)
    {
        context.FillRectangle(new SolidColorBrush(CanvasBackground), new Rect(Bounds.Size));

        var worldTransform = Matrix.CreateTranslation(_viewportX, _viewportY) * Matrix.CreateScale(_scale, _scale);
        using (context.PushTransform(worldTransform))
        {
            if (Image is { } image)
                context.DrawImage(image, new Rect(image.Size));

            DrawGrid(context);
        }

        if (_crosshair is { } cross)
        {
            var pen = new Pen(new SolidColorBrush(Color.FromArgb(128, 0, 0, 0)), 1);
            context.DrawLine(pen, new Point(cross.X, 0), new Point(cross.X, Bounds.Height));
            context.DrawLine(pen, new Point(0, cross.Y), new Point(Bounds.Width, cross.Y));
        }
    }

    private void DrawGrid(DrawingContext context)
    {
        var pen = new Pen(new SolidColorBrush(Color.FromArgb(38, 100, 100, 100)), 0.8 / _scale);

        var topLeft = ScreenToWorld(new Point(0, 0));
        var bottomRight = ScreenToWorld(new Point(Bounds.Width, Bounds.Height));

        for (var x = System.Math.Floor(topLeft.X / GridStep) * GridStep; x < bottomRight.X; x += GridStep)
            context.DrawLine(pen, new Point(x, topLeft.Y), new Point(x, bottomRight.Y));

        for (var y = System.Math.Floor(topLeft.Y / GridStep) * GridStep; y < bottomRight.Y; y += GridStep)
            context.DrawLine(pen, new Point(y: y, x: topLeft.X), new Point(y: y, x: bottomRight.X));
    }

    // --- Pan/zoom input. For the skeleton the canvas pans directly; once the
    // --- ToolSystem is ported these handlers will delegate to the active tool.

    protected override void OnPointerPressed(PointerPressedEventArgs e)
    {
        base.OnPointerPressed(e);
        Focus();

        var point = e.GetCurrentPoint(this);
        if (point.Properties.IsLeftButtonPressed || point.Properties.IsMiddleButtonPressed)
        {
            _isPanning = true;
            _lastPointer = point.Position;
            e.Pointer.Capture(this);
        }
    }

    protected override void OnPointerMoved(PointerEventArgs e)
    {
        base.OnPointerMoved(e);
        var position = e.GetPosition(this);
        _crosshair = position;

        if (_isPanning)
        {
            var delta = position - _lastPointer;
            _viewportX += delta.X / _scale;
            _viewportY += delta.Y / _scale;
            _lastPointer = position;
        }

        InvalidateVisual();
    }

    protected override void OnPointerReleased(PointerReleasedEventArgs e)
    {
        base.OnPointerReleased(e);
        _isPanning = false;
        e.Pointer.Capture(null);
    }

    protected override void OnPointerExited(PointerEventArgs e)
    {
        base.OnPointerExited(e);
        _isPanning = false;
        _crosshair = null;
        InvalidateVisual();
    }

    protected override void OnPointerWheelChanged(PointerWheelEventArgs e)
    {
        base.OnPointerWheelChanged(e);

        var position = e.GetPosition(this);
        var mouseWorld = ScreenToWorld(position);

        var newScale = e.Delta.Y > 0 ? _scale * ZoomSensitivity : _scale / ZoomSensitivity;
        newScale = System.Math.Clamp(newScale, MinScale, MaxScale);

        // Keep the world point under the cursor fixed while zooming.
        _viewportX = position.X / newScale - mouseWorld.X;
        _viewportY = position.Y / newScale - mouseWorld.Y;
        _scale = newScale;

        InvalidateVisual();
        e.Handled = true;
    }
}
