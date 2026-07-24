using System;
using System.Globalization;
using Avalonia.Data.Converters;

namespace GlazerAdmin.Converters;

/// <summary>True when the bound integer equals the (integer) converter parameter.</summary>
public class IntEqualsConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is int i && int.TryParse(parameter?.ToString(), out var p) && i == p;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
