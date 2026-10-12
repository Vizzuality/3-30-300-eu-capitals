import numpy as np

from data_processing.core.trees import find_peaks


def chm_with(peaks, shape=(60, 60)):
    yy, xx = np.mgrid[0 : shape[0], 0 : shape[1]]
    a = np.zeros(shape, np.float32)
    for r, c, h in peaks:
        a = np.maximum(a, h * np.exp(-((yy - r) ** 2 + (xx - c) ** 2) / (2 * 2.0**2)))
    return np.round(a).astype(np.uint8)


def peaks(a):
    return list(zip(*find_peaks(a, 0, 3.0, 1.0, 3, nodata=255), strict=True))


def test_two_trees_far_apart_are_two_peaks():
    assert len(peaks(chm_with([(20, 20, 12), (20, 30, 10)]))) == 2


def test_tops_closer_than_3_m_are_one_tree():
    assert len(peaks(chm_with([(20, 20, 12), (20, 22, 12)]))) == 1


def test_low_vegetation_is_not_a_tree():
    assert peaks(chm_with([(20, 20, 2)])) == []


def test_flat_top_gives_one_tree_whatever_the_band():
    a = np.zeros((40, 40), np.uint8)
    a[10:20, 10:20] = 8
    p1 = peaks(a)
    assert len(p1) == 1
    # the same plateau read as part of a band starting elsewhere gives the same pixel
    r, c = find_peaks(a[5:], 5, 3.0, 1.0, 3, nodata=255)
    assert (int(r[0]) + 5, int(c[0])) == (int(p1[0][0]), int(p1[0][1]))


def test_nodata_is_not_canopy():
    a = np.full((30, 30), 255, np.uint8)
    assert peaks(a) == []
