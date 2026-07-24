using System;
using System.Globalization;
using Avalonia.Data.Converters;

namespace GlazerAdmin.Converters;

/// <summary>True when the bound string equals the converter parameter. Used for
/// tool-button checked state.</summary>
public class StringEqualsConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        string.Equals(value?.ToString(), parameter?.ToString(), StringComparison.Ordinal);

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
